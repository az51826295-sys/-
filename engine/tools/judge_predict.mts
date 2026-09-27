/**
 * **심판 예측자** (226회차 2026-09-27, 사장님 "취향 심판자 말고 심판 예측자").
 *
 * 심판을 바로 만들지 않는다. 심판은 맞는지 잴 수가 없다 — 09-16 화면 심판자가 40~45%만 잡고도
 * 그게 몇 %인지 한참 뒤에야 알았다. 대신 **예측**한다: 이 결과물을 사장님이 보면 물릴까, 무엇을 짚을까.
 * 예측은 **맞았는지 잴 수 있다**(Brier). 맞기 시작하면 그때 문으로 쓴다.
 *
 * 시험지는 지난 결과물 + 그때 사장님이 실제로 한 말이다(`reaction.about/rejected`, 09-27 에 인용 대조로 씻었다).
 * 예측자는 **결과물만** 본다 — 정답은 채점할 때만 연다.
 *
 * 대조군 없이 "잘 맞는다" 는 말은 뜻이 없으므로([[words-into-rulers]]) 늘 셋을 같이 낸다:
 *   언제나 물림 · 언제나 통과 · 밑바탕 비율(그 회사의 물림 비율을 그대로 답하기)
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/judge_predict.mts [--run] [개수]
 */
import { createServiceClient } from "../../src/lib/supabase/service";
import { defaultProviders } from "../../src/lib/execution/shared";
import { z } from "zod";

const RUN = process.argv.includes("--run");
const LIMIT = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 20);
const db = createServiceClient();

// ── 시험지 모으기 ────────────────────────────────────────────────
const { data: msgs } = await db.from("conversation_messages")
  .select("content,attachments,created_at").eq("role", "user").not("attachments", "is", null)
  .order("created_at", { ascending: false }).limit(800);

type Case = { deliverableId: string; said: string; rejected: boolean; about: string };
const cases: Case[] = [];
for (const m of (msgs ?? []) as { content: string; attachments: unknown }[]) {
  const a = ((m.attachments ?? {}) as Record<string, unknown>).reaction as
    { deliverableId?: string | null; about?: string; rejected?: boolean } | undefined;
  if (!a?.deliverableId || typeof a.rejected !== "boolean") continue;
  if (cases.some((c) => c.deliverableId === a.deliverableId)) continue;     // 결과물 하나에 한 줄만
  cases.push({ deliverableId: a.deliverableId, said: m.content, rejected: a.rejected, about: a.about ?? "" });
}
const picked = cases.slice(0, LIMIT);
console.log(`시험지 ${cases.length}개 중 ${picked.length}개 · 물림 ${picked.filter((c) => c.rejected).length}개`);
if (!RUN) { console.log(`\n--run 을 붙이면 예측한다(재료당 ≈$0.005).`); process.exit(0); }

// ── 예측 (정답을 안 본다) ─────────────────────────────────────────
// 226회차 09-27 1판: Brier 0.387 로 **밑바탕(0.248)도 못 이겼다.** 틀린 모양이 한결같았다 —
// 예측자는 "미확인 항목 5개" · "코드 잘림" 을 짚는데 사장님은 "공이 빠르다" · "글자가 작다" 를 말했다.
// **예측자는 문서를 읽고 사장님은 게임을 한다.** 그래서 사장님이 실제로 짚은 것을 예시로 준다
// (첫 예시 하나가 거의 전부다 — 08-26 "순응은 예시가 만든다").
const PAST = await (async () => {
  const { data } = await db.from("conversation_messages").select("content,attachments")
    .eq("role", "user").not("attachments", "is", null).order("created_at", { ascending: false }).limit(800);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of (data ?? []) as { content: string; attachments: unknown }[]) {
    const a = ((m.attachments ?? {}) as Record<string, unknown>).reaction as { about?: string; rejected?: boolean } | undefined;
    if (!a?.rejected || !a.about) continue;
    if (seen.has(a.about)) continue;
    seen.add(a.about);
    out.push(`- ${a.about} — "${m.content.slice(0, 40)}"`);
    if (out.length >= 14) break;
  }
  return out.join(String.fromCharCode(10));
})();

const SYS = [
  "너는 이 회사 사장님이 결과물을 보고 무엇이라 할지 **미리 맞히는** 사람이다.",
  "사장님은 혼자 만드는 학생 개발자고, 결과가 주문과 다르거나 네가 멋대로 정한 자리를 잘 짚는다.",
  "",
  "**사장님이 지금까지 실제로 물린 것들이다. 이 사람이 무엇을 보는지 여기서 읽어라:**",
  PAST,
  "",
  "읽히는 것: 이 사람은 **직접 해 보고 느낀 것**을 말한다 — 빠르다·작다·안 나온다·반대로 간다.",
  "문서에 '미확인 항목 5개' 라고 적혀 있다고 그걸 짚지 않는다. 자 결과나 검증 개수는 이 사람의 관심이 아니다.",
  "결과물에 값(속도·크기·개수·길이)이 적혀 있으면 **그 값이 해 봤을 때 어떨지**를 생각해라.",
  "판정하지 마라 — **예측**해라. 좋고 나쁨이 아니라 *이 사람이 물릴 것인가* 다.",
  "- `물릴확률`: 0~1. 애매하면 0.5 가 아니라 네가 믿는 쪽으로 기울여라(0.5 만 답하면 아무것도 예측하지 않은 것이다).",
  "- `짚을것`: 물린다면 **무엇을** 짚을지 짧은 말로(예: 공 속도 · 투구 크기 · 파일 전달 방식). 안 물릴 것 같으면 빈 문자열.",
  "- `왜`: 한 줄.",
].join(String.fromCharCode(10));

const schema = z.object({
  물릴확률: z.number(),
  짚을것: z.string(),
  왜: z.string(),
});

type Row = Case & { p: number; guess: string; why: string; kind: string };
const rows: Row[] = [];
for (const c of picked) {
  const { data: d } = await db.from("deliverables").select("title,deliverable_type,content_markdown,content_json").eq("id", c.deliverableId).maybeSingle();
  const dd = d as { title: string; deliverable_type: string; content_markdown: string; content_json: Record<string, unknown> } | null;
  if (!dd) continue;
  // 226회차: 설명문만 주니 예측자가 "미확인 항목 5개" 를 짚었다. 사장님은 **해 보고** 말한다.
  // 실행까지 가기 전에 **코드**라도 준다 — 속도·크기·개수가 거기 숫자로 적혀 있다.
  const files = (dd.content_json?.files ?? null) as { path: string; contents?: string }[] | null;
  const code = (files ?? [])
    .filter((f) => /[.](js|ts|cs|html)$/i.test(f.path) && f.contents)
    .map((f) => `--- ${f.path} ---` + String.fromCharCode(10) + (f.contents ?? "").slice(0, 4000))
    .join(String.fromCharCode(10, 10)).slice(0, 9000);
  try {
    const { output } = await defaultProviders().ai.generateStructuredOutput({
      systemInstructions: SYS,
      input: [
        `종류: ${dd.deliverable_type}`, `제목: ${dd.title}`, "",
        "결과물 설명:", (dd.content_markdown ?? "").slice(0, 2000),
        ...(code ? ["", "코드(여기 적힌 값이 해 봤을 때 어떨지 생각해라 — 속도·크기·개수·시간):", code] : []),
      ].join(String.fromCharCode(10)),
      schema, schemaName: "judge_predict", maxTokens: 900, tier: "routine",
    });
    rows.push({ ...c, kind: dd.deliverable_type, p: Math.min(1, Math.max(0, output.물릴확률)), guess: output.짚을것.trim(), why: output.왜 });
  } catch (e) { console.log(`  ${c.deliverableId.slice(0,8)} 예측 실패`); }
}

// ── 채점 ────────────────────────────────────────────────────────
const brier = (ps: number[], ys: boolean[]) => ps.reduce((s, p, i) => s + (p - (ys[i] ? 1 : 0)) ** 2, 0) / ps.length;
const ys = rows.map((r) => r.rejected);
const base = ys.filter(Boolean).length / ys.length;
const mine = brier(rows.map((r) => r.p), ys);
const always = brier(rows.map(() => 1), ys);
const never = brier(rows.map(() => 0), ys);
const rate = brier(rows.map(() => base), ys);

console.log(`\n=== 예측 ${rows.length}건 ===`);
for (const r of rows.slice(0, 12)) {
  const hit = (r.p >= 0.5) === r.rejected;
  console.log(`  ${hit ? "맞음" : "틀림"} p=${r.p.toFixed(2)} → 실제 ${r.rejected ? "물림" : "통과"}`);
  console.log(`       짚을것 "${r.guess || "-"}" ↔ 사장님 "${r.about || "-"}"`);
}
const hits = rows.filter((r) => (r.p >= 0.5) === r.rejected).length;
console.log(`\n맞힌 것 ${hits}/${rows.length} (${(hits/rows.length*100).toFixed(0)}%)`);
console.log(`Brier (낮을수록 좋다)`);
console.log(`  **예측자      ${mine.toFixed(3)}**`);
console.log(`   밑바탕 비율  ${rate.toFixed(3)}  ← 이걸 못 이기면 아무것도 안 배운 것이다`);
console.log(`   언제나 물림  ${always.toFixed(3)}`);
console.log(`   언제나 통과  ${never.toFixed(3)}`);

// 226회차: **종류를 갈라 본다.** 게임은 문서로 못 맞힌다는 짐작을 확인하려면 갈라 세야 한다 —
// 합쳐 세면 한 종류의 실패가 다른 종류의 성공을 덮는다(09-22 "길 개수를 먼저 세고 자는 갈라 센다").
const byKind = new Map<string, Row[]>();
for (const r of rows) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
console.log(`\n종류별:`);
for (const [k, rs] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
  const h = rs.filter((r) => (r.p >= 0.5) === r.rejected).length;
  const bs = brier(rs.map((r) => r.p), rs.map((r) => r.rejected));
  const bb = rs.filter((r) => r.rejected).length / rs.length;
  const baseB = brier(rs.map(() => bb), rs.map((r) => r.rejected));
  console.log(`  ${k.padEnd(14)} ${String(rs.length).padStart(2)}건 · 맞힘 ${h}/${rs.length} · Brier ${bs.toFixed(3)} (밑바탕 ${baseB.toFixed(3)})${bs < baseB ? "  ← **이겼다**" : ""}`);
}

// 다음 판에 다시 안 사도 되게 남긴다.
import("node:fs").then((fs) => {
  fs.writeFileSync("engine/data/judge_predict.json", JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
  console.log(`\nengine/data/judge_predict.json 에 남겼다.`);
});
