import { z } from "zod";
import { YoutubeTranscript } from "youtube-transcript";
import { Innertube, ClientType, Log as YtLog } from "youtubei.js";
import { ExecutionError, setStep } from "@/lib/execution/shared";
import { step } from "@/lib/execution/steps";
import { createHttpContentFetcher } from "@/lib/providers/fetcher";
import { extractText, getDocumentProxy } from "unpdf";
import type { EmployeeSkill, SkillRunContext } from "@/lib/skills/types";

/**
 * 분석 — 유튜브 영상·웹 자료를 읽고 "무엇을 말했나" 를 출처와 함께 표로 낸다 (36회차 09-07).
 *
 * 09-06 사장님: "게임 먼저 하는데 과제·유튜브 영상·분석 등 하는 거니까 구조는 만들어 놔." 종류 등록표(`work/kinds.ts`)에
 * 자리만 있던 것을 첫 직원(Ana)으로 채운다. 게임 쪽과 같은 뼈대다: 읽기(단계 저장) → 쓰기 → **자**(deterministic) → 산출물.
 *
 * 자는 모델이 아니다. 주장마다 붙인 인용(quote)이 **원문에 실제로 있는지**를 글자 비교로 잰다. 없으면 그 주장은
 * "근거 못 찾음" 으로 남는다 — 지어낸 인용이 가장 흔한 거짓말이고, 그건 사람이 못 잡는다(원문을 안 읽으니까).
 */

const analysis = z.object({
  title: z.string(),
  /** 3~6줄. 한 줄에 한 가지. */
  summary: z.array(z.string()),
  claims: z.array(z.object({
    /** 원문이 말한 것을 우리 말로. */
    claim: z.string(),
    /** 원문 **그대로** 20~200자. 자가 이 글자를 원문에서 찾는다 — 바꿔 쓰면 떨어진다. */
    quote: z.string(),
    /** 영상이면 mm:ss(인용이 나오는 자리), 글이면 null. */
    at: z.string().nullable(),
    source: z.string(),
  })),
  numbers: z.array(z.object({ what: z.string(), value: z.string(), quote: z.string(), at: z.string().nullable(), source: z.string() })),
  /** 회사(우리)에게 뜻하는 것. 원문에 없는 판단이므로 그렇게 적는다. */
  forUs: z.array(z.string()),
  /** 자료가 답하지 않은 것. */
  unanswered: z.array(z.string()),
});
type Analysis = z.infer<typeof analysis>;

type Source = { url: string; kind: "youtube" | "web" | "pdf"; title: string; text: string; durationSec: number | null; pages: number | null; chars: number };

const URL_RE = /https?:\/\/[^\s)\]>"']+/g;
const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

function mmss(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

type Seg = { text: string; offset: number; duration: number };

/**
 * 38회차: 서버(Railway)에선 watch 페이지 긁기(youtube-transcript)가 봇으로 찍혀 "Transcript is disabled" 를 받는다.
 * 안드로이드·iOS 앱이 쓰는 Innertube 로 자막 트랙 주소(서명 포함)를 받아 json3 로 읽는다 — 로컬 실측: ANDROID en 1트랙, IOS 21트랙.
 */
async function readViaInnertube(id: string): Promise<{ segs: Seg[]; lang: string; via: string } | null> {
  YtLog.setLevel(YtLog.Level.NONE);
  for (const client of [ClientType.ANDROID, ClientType.IOS]) {
    try {
      const yt = await Innertube.create({ client_type: client });
      const info = await yt.getBasicInfo(id, { client: client === ClientType.ANDROID ? "ANDROID" : "IOS" });
      const tracks = (info.captions?.caption_tracks ?? []) as { language_code: string; base_url: string; kind?: string }[];
      if (!tracks.length) continue;
      const pick = tracks.find((t) => t.language_code === "en") ?? tracks.find((t) => t.language_code === "ko") ?? tracks[0];
      const r = await fetch(pick.base_url + "&fmt=json3");
      if (!r.ok) continue;
      const j = (await r.json()) as { events?: { tStartMs: number; dDurationMs?: number; segs?: { utf8: string }[] }[] };
      const segs: Seg[] = (j.events ?? [])
        .filter((e) => e.segs && e.segs.length)
        .map((e) => ({ text: e.segs!.map((x) => x.utf8).join("").replace(/\n/g, " "), offset: e.tStartMs, duration: e.dDurationMs ?? 0 }))
        .filter((e) => e.text.trim().length > 0);
      if (segs.length) return { segs, lang: pick.language_code, via: `innertube-${String(client).toLowerCase()}` };
    } catch (e) {
      console.warn(`[analysis] innertube ${client} 실패: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
  }
  return null;
}

/** 자막을 30초마다 [mm:ss] 표시를 넣은 글로. 모델은 이 표시로 `at` 을 적고, 자는 그 표시가 길이 안에 있는지 본다. */
async function readYoutube(url: string, id: string): Promise<Source> {
  const inner = await readViaInnertube(id);
  if (inner) {
    console.log(`[analysis] 자막 ${id} via ${inner.via} lang=${inner.lang} segments=${inner.segs.length}`);
    return fromSegs(url, id, inner.segs, `${inner.lang}·${inner.via}`);
  }
  // 36회차 1판: 기본 자막이 아랍어로 왔다(라이브러리는 첫 트랙을 집는다). 영어 → 한국어 → 아무거나 순으로 청한다.
  // 37회차: 서버(Railway)에서는 같은 영상이 "Transcript is disabled" 로 거절되기도 한다(로컬은 됨 — 유튜브가 데이터센터 IP 를 막는 것).
  // 세 번까지 3·6·9초 쉬고 다시 청한다. 그래도 안 되면 못 읽은 것으로 적는다 — 지어내지 않는다.
  let segs: Awaited<ReturnType<typeof YoutubeTranscript.fetchTranscript>> = [];
  let lang = "";
  let lastError = "";
  for (let attempt = 0; attempt < 3 && !segs.length; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 3000 * attempt));
    for (const want of ["en", "ko"]) {
      try { segs = await YoutubeTranscript.fetchTranscript(id, { lang: want }); if (segs.length) { lang = want; break; } }
      catch (e) { lastError = e instanceof Error ? e.message : String(e); }
    }
    if (!segs.length) {
      try { segs = await YoutubeTranscript.fetchTranscript(id); lang = segs[0]?.lang ?? "?"; }
      catch (e) { lastError = e instanceof Error ? e.message : String(e); }
    }
  }
  if (!segs.length) throw new Error(`자막을 못 받았다(innertube 둘 + 긁기 3번): ${lastError.slice(0, 120)}`);
  console.log(`[analysis] 자막 ${id} via scrape lang=${lang} segments=${segs.length}`);
  return fromSegs(url, id, segs.map((x) => ({ text: x.text, offset: x.offset, duration: x.duration })), `${lang}·scrape`);
}

function fromSegs(url: string, id: string, segs: Seg[], lang: string): Source {
  let text = ""; let mark = -1;
  for (const s of segs) {
    const bucket = Math.floor(s.offset / 30_000);
    if (bucket !== mark) { mark = bucket; text += `\n[${mmss(s.offset)}] `; }
    text += s.text.replace(/\s+/g, " ") + " ";
  }
  const last = segs[segs.length - 1];
  return { url, kind: "youtube", title: `YouTube ${id} (자막 ${lang})`, text: text.trim(), durationSec: Math.ceil((last.offset + last.duration) / 1000), pages: null, chars: text.length };
}

async function readWeb(url: string): Promise<Source> {
  const got = await createHttpContentFetcher().fetch(url);
  return { url, kind: "web", title: got.title ?? url, text: got.text, durationSec: null, pages: null, chars: got.text.length };
}

/** PDF(37회차): 쪽마다 [p.N] 표시. 모델은 `at` 에 p.N 을 적고, 자는 그 쪽이 있는지 본다. */
async function readPdf(url: string): Promise<Source> {
  const r = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (Rookery analysis)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  const pdf = await getDocumentProxy(buf);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = (text as string[]).map((t, i) => `[p.${i + 1}] ${t.replace(/\s+/g, " ").trim()}`).filter((t) => t.length > 8);
  const joined = pages.join("\n");
  return { url, kind: "pdf", title: `PDF ${url.split("/").pop() ?? url} (${totalPages}쪽)`, text: joined, durationSec: null, pages: totalPages, chars: joined.length };
}

function isPdfUrl(url: string): boolean { return /\.pdf(\?|#|$)/i.test(url); }

/** 글자 비교용. 대소문자·공백·따옴표·문장부호를 지운다 — 인용이 "그대로" 인지 보는 것이지 띄어쓰기를 보는 게 아니다. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\[\d\d:\d\d\]/g, "").replace(/\[p\.\d+\]/g, "").replace(/[\s"'“”‘’,.\-—–…:;!?()[\]]/g, "");
}

function secondsOf(at: string | null): number | null {
  if (!at) return null;
  const m = /^(\d{1,3}):(\d\d)$/.exec(at.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

type Case = { name: string; result: "Passed" | "Failed"; message: string };

/** 자: 인용이 원문에 있는가, 시각이 길이 안인가. */
function judge(a: Analysis, sources: Source[]): { cases: Case[]; passed: number; failed: number } {
  const bySrc = new Map(sources.map((s) => [s.url, s]));
  const normText = new Map(sources.map((s) => [s.url, norm(s.text)]));
  const cases: Case[] = [];
  const check = (kind: string, i: number, quote: string, at: string | null, source: string, label: string) => {
    const q = norm(quote);
    const name = `${kind}_${i + 1}`;
    // 37회차 1판의 구멍: 못 읽은 영상을 출처로 적은 인용이 다른 자료(PDF)에서 발견돼 통과했다. 출처는 읽은 자료 중 하나여야 한다.
    const src = bySrc.get(source);
    if (!src) { cases.push({ name, result: "Failed", message: `${label}: 출처 "${source.slice(0, 60)}" 는 읽은 자료가 아니다 — 인용을 어디서 가져왔나` }); return; }
    const nt = normText.get(src.url) ?? "";
    if (q.length < 8) { cases.push({ name, result: "Failed", message: `${label}: 인용이 너무 짧다(${quote.length}자)` }); return; }
    if (!nt.includes(q)) { cases.push({ name, result: "Failed", message: `${label}: 인용이 원문에 없다 — "${quote.slice(0, 60)}"` }); return; }
    const sec = secondsOf(at);
    if (src?.durationSec != null && sec != null && sec > src.durationSec) { cases.push({ name, result: "Failed", message: `${label}: ${at} 는 영상 길이(${mmss(src.durationSec * 1000)}) 밖` }); return; }
    const pg = at ? /^p\.(\d+)$/.exec(at.trim()) : null;
    if (src?.pages != null && pg && Number(pg[1]) > src.pages) { cases.push({ name, result: "Failed", message: `${label}: ${at} 는 ${src.pages}쪽 밖` }); return; }
    // 쪽 표시가 있으면 인용이 그 쪽에 있는지도 본다 — 쪽만 지어내는 것도 지어내는 것이다.
    if (src?.pages != null && pg) {
      const pageText = src.text.split("\n").find((l) => l.startsWith(`[p.${pg[1]}]`)) ?? "";
      if (!norm(pageText).includes(q)) { cases.push({ name, result: "Failed", message: `${label}: 인용은 있지만 ${at} 쪽이 아니다` }); return; }
    }
    cases.push({ name, result: "Passed", message: `${label}: 원문에 있음${at ? ` (${at})` : ""}` });
  };
  a.claims.forEach((c, i) => check("근거", i, c.quote, c.at, c.source, c.claim.slice(0, 50)));
  a.numbers.forEach((n, i) => check("숫자", i, n.quote, n.at, n.source, `${n.what} ${n.value}`.slice(0, 50)));
  const passed = cases.filter((c) => c.result === "Passed").length;
  return { cases, passed, failed: cases.length - passed };
}

function shortSrc(url: string): string {
  const yt = YT_RE.exec(url); if (yt) return "영상";
  if (isPdfUrl(url)) return "PDF";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "글"; }
}

function render(a: Analysis, sources: Source[], v: ReturnType<typeof judge>): string {
  const ok = new Set(v.cases.filter((c) => c.result === "Passed").map((c) => c.name));
  const row = (kind: string, i: number, cols: string[]) => `| ${ok.has(`${kind}_${i + 1}`) ? "✅" : "❌ 근거 못 찾음"} | ${cols.map((c) => c.replace(/\|/g, "／").replace(/\n/g, " ")).join(" | ")} |`;
  const unread = sources.filter((s) => s.chars === 0);
  return [
    ...(unread.length ? [`> **못 읽은 자료 ${unread.length}개**: ${unread.map((s) => s.url).join(", ")} — 아래는 읽은 자료만으로 쓴 것이에요. 다시 시키면 다시 받아 봐요.`, ""] : []),
    `## 요약`, "", ...a.summary.map((s) => `- ${s}`), "",
    `## 핵심 주장 (${a.claims.length})`, "", `| 자 | 주장 | 원문 인용 | 어디서 |`, `|---|---|---|---|`,
    ...a.claims.map((c, i) => row("근거", i, [c.claim, `"${c.quote}"`, (c.at ?? "글") + (sources.length > 1 ? ` · ${shortSrc(c.source)}` : "")])), "",
    ...(a.numbers.length ? [`## 숫자 (${a.numbers.length})`, "", `| 자 | 무엇 | 값 | 원문 인용 | 어디서 |`, `|---|---|---|---|---|`, ...a.numbers.map((n, i) => row("숫자", i, [n.what, n.value, `"${n.quote}"`, n.at ?? "글"])), ""] : []),
    `## 우리에게 (원문에 없는 판단)`, "", ...a.forUs.map((s) => `- ${s}`), "",
    ...(a.unanswered.length ? [`## 자료가 답하지 않은 것`, "", ...a.unanswered.map((s) => `- ${s}`), ""] : []),
    `## 자료`, "", ...sources.map((s) => `- ${s.kind === "youtube" ? "영상" : s.kind === "pdf" ? "PDF" : "글"} ${s.url} — ${s.chars.toLocaleString()}자${s.durationSec ? ` · ${mmss(s.durationSec * 1000)}` : ""}${s.pages ? ` · ${s.pages}쪽` : ""}${s.chars === 0 ? " · **못 읽음**" : ""}`), "",
    `---`, "", `**출처 자**: 인용 ${v.cases.length}개 중 원문에서 찾음 ${v.passed} · 못 찾음 ${v.failed}. 못 찾은 줄은 믿지 마세요 — 그 줄만 지어낸 것일 수 있어요.`,
  ].join("\n");
}

export const analysisSkill: EmployeeSkill = {
  id: "analysis",
  deliverableType: "analysis",
  capabilities: [
    {
      id: "analysis_sources",
      label:
        "자료·유튜브 영상 분석 — 링크를 주면 요약·핵심 주장·숫자를 원문 인용(영상은 시각)과 함께 표로. " +
        "'이 영상 분석해 줘'·'이 글 요약해 줘'·'이 자료에서 숫자 뽑아 줘' 는 여기 / Analyze a YouTube video or web page",
      produces: "요약 5줄, 주장 표(주장·원문 인용·시각), 숫자 표, 우리에게 뜻하는 것 — 인용마다 원문에 있는지 자가 잰 결과",
    },
  ],
  acceptsInternalRequests: true,

  async run(ctx: SkillRunContext) {
    const ask = `${ctx.context.assignment.title}\n${ctx.context.assignment.description ?? ""}`;
    const urls = Array.from(new Set((ask.match(URL_RE) ?? []).map((u) => u.replace(/[.,)]+$/, "")))).slice(0, 4);
    if (!urls.length) throw new ExecutionError("CONTEXT_INCOMPLETE", "분석할 링크가 없다. 유튜브나 글 주소를 하나 이상 적어야 한다.");

    // ── 1. 읽는다 (단계 저장: 죽어도 다시 안 받는다) ──
    await setStep(ctx.supabase, ctx.executionId, "planning");
    const sources = await step(ctx.supabase, ctx.executionId, "read", async () => {
      const out: Source[] = [];
      for (const url of urls) {
        const yt = YT_RE.exec(url);
        try {
          const s = yt ? await readYoutube(url, yt[1]) : isPdfUrl(url) ? await readPdf(url) : await readWeb(url);
          out.push({ ...s, text: s.text.slice(0, 120_000) });
        } catch (e) {
          out.push({ url, kind: yt ? "youtube" : isPdfUrl(url) ? "pdf" : "web", title: url, text: "", durationSec: null, pages: null, chars: 0 });
          console.warn(`[analysis] 못 읽음 ${url}: ${e instanceof Error ? e.message : e}`);
        }
      }
      return out;
    });
    const readable = sources.filter((s) => s.chars > 200);
    if (!readable.length) {
      throw new ExecutionError("SOURCE_FETCH_FAILED", `자료를 못 읽었다: ${sources.map((s) => s.url).join(", ")} (유튜브면 자막이 없는 영상일 수 있다)`);
    }

    // ── 2. 쓴다 ──
    await setStep(ctx.supabase, ctx.executionId, "generating");
    const write = (failedBefore: string[]) => ctx.providers.ai.generateStructuredOutput({
      systemInstructions:
        "너는 이 회사의 분석가다. 아래 자료를 읽고 한국어로 정리한다.\n\n" +
        "- `summary` 3~6줄. 한 줄에 한 가지. 자료에 없는 말을 넣지 마라.\n" +
        "- `claims` 6~12개. 자료가 실제로 말한 것만. **`quote` 는 원문 글자 그대로 20~200자** — 기계가 원문에서 그 글자를 찾는다. " +
        "요약하거나 번역하거나 고쳐 쓰면 떨어진다. 영어 자료면 영어 그대로 인용하고 `claim` 만 한국어로.\n" +
        "- 영상이면 `at` 은 인용이 나오는 자리의 [mm:ss] 표시(그 인용 바로 앞의 표시). PDF 면 그 인용이 있는 쪽의 [p.N] 표시를 `p.N` 으로. 글이면 null.\n" +
        "- 자료가 여럿이면 `source` 에 그 인용이 나온 자료의 주소를 정확히 적는다. 여러 자료가 같은 말을 하면 자료마다 한 줄씩(인용은 각자 원문에서).\n" +
        "- `numbers`: 자료의 숫자(값·단위)를 인용과 함께. 없으면 빈 배열.\n" +
        "- `forUs`: 이 회사(게임 만드는 작은 팀)에 뜻하는 것 2~4줄 — 원문에 없는 네 판단이라고 알고 쓴다.\n" +
        "- `unanswered`: 업무가 물었는데 자료가 답하지 않은 것.\n" +
        (failedBefore.length ? `\n지난 판에서 기계가 원문에서 못 찾은 인용(고쳐서 다시 — 원문 글자 그대로):\n${failedBefore.map((f) => `- ${f}`).join("\n")}\n` : ""),
      input:
        `업무: ${ctx.context.assignment.title}\n설명: ${ctx.context.assignment.description ?? ""}\n` +
        (sources.some((s) => s.chars === 0) ? `\n**못 읽은 자료(인용 금지, 출처로 적지 마라)**: ${sources.filter((s) => s.chars === 0).map((s) => s.url).join(", ")}\n` : "") + "\n" +
        readable.map((s) => `## 자료 ${s.url} (${s.kind === "youtube" ? `영상 ${s.durationSec ? mmss(s.durationSec * 1000) : ""}` : s.kind === "pdf" ? `PDF ${s.pages}쪽` : "글"})\n${s.text}`).join("\n\n"),
      schema: analysis,
      schemaName: "source_analysis",
      maxTokens: 16000,
      tier: "judgment",
    });
    let out = (await step(ctx.supabase, ctx.executionId, "analyze", async () => (await write([])).output)) as Analysis;

    // ── 3. 잰다 — 인용이 원문에 있는가. 절반 넘게 떨어지면 한 번 다시 쓴다(떨어진 줄을 보여 주고) ──
    await setStep(ctx.supabase, ctx.executionId, "verifying");
    let verdict = judge(out, readable);
    if (verdict.cases.length && verdict.failed > verdict.passed) {
      const failedLines = verdict.cases.filter((c) => c.result === "Failed").map((c) => c.message);
      out = (await step(ctx.supabase, ctx.executionId, "analyze2", async () => (await write(failedLines)).output)) as Analysis;
      verdict = judge(out, readable);
    }

    const markdown = render(out, sources, verdict);
    const content = {
      sources: sources.map(({ url, kind, title, durationSec, pages, chars }) => ({ url, kind, title, durationSec, pages, chars })),
      claims: out.claims, numbers: out.numbers, forUs: out.forUs, unanswered: out.unanswered,
      verdict: { verdict: verdict.failed === 0 ? "PASS" : verdict.passed >= verdict.failed ? "PARTIAL" : "FAIL", passed: verdict.passed, failed: verdict.failed, cases: verdict.cases },
    };
    const { data: saved, error } = await ctx.supabase.rpc("submit_generated_deliverable", {
      p_execution_id: ctx.executionId,
      p_title: out.title,
      p_deliverable_type: "analysis",
      p_content_markdown: markdown,
      p_content_json: content,
      p_generation_model: ctx.providers.ai.model,
      p_citations: [],
    });
    if (error) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", error.message);
    const rpc = saved as { ok: boolean; reason?: string; deliverableId?: string };
    if (!rpc.ok && !(rpc.reason === "already_submitted" && rpc.deliverableId)) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", rpc.reason ?? "unknown");
    return { deliverableId: rpc.deliverableId as string, deliverableType: "analysis", metrics: { sourceCount: readable.length, candidateCount: verdict.cases.length, selectedCount: verdict.passed } };
  },
};
