/**
 * 두근도트 자가진단 — **앱이 자기 기록을 재는 자** (35회차, 09-11).
 *
 * 회사 selfcheck 와 같은 규칙: 줄마다 **몇 개를 봤는지** 적고, 0개를 보고 통과라고 말하지 않는다(◻︎ 못 잼).
 * 전부 결정적 셈이다 — 모델을 부르지 않는다. 지난 7일.
 *
 *   npx tsx engine/tools/dot_selfcheck.mts [일수=7]
 *
 * 줄:
 *   1 무표정 비율(인물별)          dot_messages.emotion         ≤ 40%
 *   2 기억 근거율                 dot_bonds.memo vs 사용자 말    ≥ 80% (memo.ts 의 문으로 거꾸로 잰다)
 *   3 첫 글자까지 p50/p95          dot_turns.ms_first_token      p50 ≤ 1500ms · p95 ≤ 4000ms
 *   4 사람당 하루 원가             dot_usage 토큰 × 단가          ≤ $0.03/사람/일
 *   5 다음날 복귀(D1)             dot_messages 날짜             (사람 생기면) ≥ 30%
 *   6 먼저 말 걸기                dot_bonds.last_pinged_on · 구독 죽은 수
 *   7 싼 자리 지갑                DeepSeek 잔액                 ≥ $3
 *   8 캐시 적중률(79회차)          dot_turns.cached_tokens       ≥ 60% — 원가가 1/3 이 되는 자리
 *   9 돈(적자 판정)               원가(캐시 반영) vs 수입(원장)   사람 10명 넘으면 원가 > 수입이면 ✗
 *  10 게시물                      dot_posts                     공개 캐릭터×일수의 90% 이상
 *  11 멘헤라                      dot_entitlements·dot_bonds     (보고만)
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { support, MIN_SUPPORT } = await import("../../src/lib/dot/memo");
const { deepSeekWallet, LOW_USD } = await import("../../src/lib/providers/balance");
const { todayKST } = await import("../../src/lib/dot/bond");

const DAYS = Number(process.argv[2] ?? 7);
const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
const db = createServiceClient();
const NL = String.fromCharCode(10);

type Line = { name: string; unit: string; looked: number; bad: string[]; note?: string };
const lines: Line[] = [];
const add = (name: string, unit: string, looked: number, bad: string[], note?: string) => lines.push({ name, unit, looked, bad, note });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const q = (arr: number[], p: number) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// DeepSeek v4-flash 값(1M 토큰, 피크). 값이 바뀌면 여기만.
const IN_USD = 0.44 / 1e6, OUT_USD = 1.32 / 1e6, CACHE_USD = 0.014 / 1e6;
const KRW = 1380;

const { data: chars } = await db.from("dot_characters").select("id, name").eq("is_public", true);
const nameOf = new Map((chars ?? []).map((c) => [c.id as string, c.name as string]));

// 1) 무표정
{
  const { data } = await db.from("dot_messages").select("character_id, emotion").eq("role", "character").gte("created_at", since).limit(5000);
  const rows = (data ?? []) as { character_id: string; emotion: string | null }[];
  const by = new Map<string, { n: number; neutral: number }>();
  for (const r of rows) { if (!nameOf.has(r.character_id)) continue;   // 숨은 시험 인물은 안 센다
    const b = by.get(r.character_id) ?? { n: 0, neutral: 0 }; b.n++; if ((r.emotion ?? "neutral") === "neutral") b.neutral++; by.set(r.character_id, b); }
  const bad: string[] = [];
  for (const [id, b] of by) if (b.n >= 5 && b.neutral / b.n > 0.4) bad.push(`${nameOf.get(id) ?? id.slice(0, 8)} 무표정 ${pct(b.neutral / b.n)} (${b.neutral}/${b.n})`);
  add("무표정 비율", "캐릭터 답", rows.length, bad, [...by].map(([id, b]) => `${nameOf.get(id) ?? "?"} ${pct(b.neutral / b.n)}`).join(" · ") || undefined);
}

// 2) 기억 근거율 — 각 기억이 그 사람의 어느 한 마디에 뿌리 절반 이상 있나
{
  const { data: bonds } = await db.from("dot_bonds").select("user_id, character_id, memo");
  let looked = 0, unsupported = 0; const bad: string[] = [];
  for (const b of (bonds ?? []) as { user_id: string; character_id: string; memo: string[] }[]) {
    if (!Array.isArray(b.memo) || !b.memo.length) continue;
    const { data: ms } = await db.from("dot_messages").select("content").eq("user_id", b.user_id).eq("character_id", b.character_id).eq("role", "user").limit(500);
    const said = ((ms ?? []) as { content: string }[]).map((m) => m.content);
    for (const f of b.memo) {
      looked++;
      const best = said.reduce((mx, l) => Math.max(mx, support(f, l)), 0);
      if (best < MIN_SUPPORT) { unsupported++; if (bad.length < 6) bad.push(`${nameOf.get(b.character_id) ?? "?"}: "${f.slice(0, 40)}"`); }
    }
  }
  add("기억 근거율", "기억", looked, looked && unsupported / looked > 0.2 ? [`근거 없는 기억 ${unsupported}/${looked}`, ...bad] : [], looked ? `근거 있음 ${pct(1 - unsupported / looked)}` : undefined);
}

// 3) 첫 글자까지
{
  const { data } = await db.from("dot_turns").select("ms_first_token, ms_total, ms_prepare, ms_model").gte("created_at", since).limit(5000);
  const rows = (data ?? []) as { ms_first_token: number | null; ms_total: number; ms_prepare: number; ms_model: number }[];
  const first = rows.map((r) => r.ms_first_token).filter((x): x is number => x !== null);
  const p50 = q(first, 0.5), p95 = q(first, 0.95);
  const bad: string[] = [];
  if (p50 !== null && p50 > 1500) bad.push(`첫 글자 p50 ${p50}ms (>1500)`);
  if (p95 !== null && p95 > 4000) bad.push(`첫 글자 p95 ${p95}ms (>4000)`);
  const note = first.length ? `첫 글자 p50 ${p50}ms · p95 ${p95}ms · 준비 p50 ${q(rows.map((r) => r.ms_prepare), 0.5)}ms · 합 p50 ${q(rows.map((r) => r.ms_total), 0.5)}ms` : "흘려보낸 턴이 없어 첫 글자를 못 잼";
  add("첫 글자까지", "흘려보낸 턴", first.length, bad, note);
}

// 4) 사람당 하루 원가
{
  const { data } = await db.from("dot_usage").select("user_id, day, turns, input_tokens, output_tokens").gte("day", since.slice(0, 10));
  const rows = (data ?? []) as { user_id: string; day: string; turns: number; input_tokens: number; output_tokens: number }[];
  const costs = rows.map((r) => r.input_tokens * IN_USD + r.output_tokens * OUT_USD);
  const avg = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
  const worst = costs.length ? Math.max(...costs) : 0;
  add("사람당 하루 원가", "사람·일", rows.length, avg > 0.03 ? [`평균 $${avg.toFixed(4)} (>$0.03)`] : [],
    rows.length ? `평균 $${avg.toFixed(4)} · 최대 $${worst.toFixed(4)} · 턴 평균 ${(rows.reduce((a, r) => a + r.turns, 0) / rows.length).toFixed(1)}` : undefined);
}

// 5) 다음날 복귀 — 어제 이전 어느 날 D 에 말한 사람 중 D+1 에도 말한 비율(창 안 평균)
{
  const { data } = await db.from("dot_messages").select("user_id, created_at").eq("role", "user").gte("created_at", since).limit(20000);
  const days = new Map<string, Set<string>>();  // day → users
  for (const r of (data ?? []) as { user_id: string; created_at: string }[]) {
    const d = todayKST(new Date(r.created_at));
    if (!days.has(d)) days.set(d, new Set()); days.get(d)!.add(r.user_id);
  }
  const today = todayKST();
  let pairs = 0, returned = 0;
  for (const [d, users] of days) {
    if (d >= today) continue;                       // 오늘은 아직 안 끝났다
    const next = todayKST(new Date(new Date(d + "T00:00:00Z").getTime() + 86_400_000));
    if (next >= today) continue;                    // 다음 날이 오늘이면 아직 못 잰다
    const nu = days.get(next) ?? new Set();
    for (const u of users) { pairs++; if (nu.has(u)) returned++; }
  }
  add("다음날 복귀(D1)", "사람·일 쌍", pairs, pairs >= 5 && returned / pairs < 0.3 ? [`복귀 ${pct(returned / pairs)} (<30%)`] : [],
    pairs ? `복귀 ${returned}/${pairs} = ${pct(returned / pairs)}` : "잴 만한 날 쌍이 없다(사람이 생겨야)");
}

// 6) 먼저 말 걸기
{
  const [{ data: subs }, { data: pinged }] = await Promise.all([
    db.from("dot_push_subs").select("dead_at"),
    db.from("dot_bonds").select("last_pinged_on").gte("last_pinged_on", since.slice(0, 10)),
  ]);
  const s = (subs ?? []) as { dead_at: string | null }[];
  const dead = s.filter((x) => x.dead_at).length;
  add("먼저 말 걸기", "구독", s.length, s.length && dead / s.length > 0.5 ? [`죽은 구독 ${dead}/${s.length}`] : [],
    s.length ? `산 구독 ${s.length - dead} · 죽음 ${dead} · ${DAYS}일간 말 건 사이 ${(pinged ?? []).length}` : "구독이 없다 — 아무에게도 못 건다");
}

// 7) 지갑
{
  const w = await deepSeekWallet();
  if (w.usd === null) add("싼 자리 지갑", "벤더", 0, [], w.note);
  else add("싼 자리 지갑", "벤더", 1, (!w.available || w.usd < LOW_USD) ? [`${w.vendor} ${w.note} (${LOW_USD} 아래)`] : [], `지금 ${w.note}`);
}

// 8) 캐시 적중률 — DeepSeek 가 앞부분(시스템·지난 대화)을 캐시하면 입력값이 1/31. 이게 원가의 몸통이다(09-11 돈 계산).
let cacheRate: number | null = null;
{
  // cached_tokens 는 09-11 19:49 배포부터 적힌다 — 그 전 턴은 0 이라 섞으면 적중률이 헛되이 낮아진다.
  const CACHE_SINCE = "2026-09-11T10:49:00Z";
  const { data } = await db.from("dot_turns").select("input_tokens, cached_tokens, output_tokens").gte("created_at", since > CACHE_SINCE ? since : CACHE_SINCE).limit(20000);
  const rows = (data ?? []) as { input_tokens: number; cached_tokens: number; output_tokens: number }[];
  const inAll = rows.reduce((a, r) => a + r.input_tokens, 0), hit = rows.reduce((a, r) => a + (r.cached_tokens ?? 0), 0);
  cacheRate = inAll ? hit / inAll : null;
  add("캐시 적중률", "턴", rows.length, cacheRate !== null && rows.length >= 20 && cacheRate < 0.6 ? [`캐시 ${pct(cacheRate)} (<60%) — 앞부분이 매번 바뀌고 있다`] : [],
    cacheRate !== null ? `${rows.length < 20 ? "(20턴 미만 — 참고만) " : ""}입력 ${inAll} 중 캐시 ${hit} = ${pct(cacheRate)} · 턴당 원가 ₩${(((inAll - hit) * IN_USD + hit * CACHE_USD + rows.reduce((a, r) => a + r.output_tokens, 0) * OUT_USD) / Math.max(1, rows.length) * KRW).toFixed(2)}` : undefined);
}

// 9) 돈 — 원가(캐시 반영, 턴 원장) + 고정비 vs 수입(원장). 사람이 10명 미만이면 못 잰다고 적는다(적자는 사람이 있어야 의미가 있다).
{
  const [{ data: t }, { data: p }, { data: u }] = await Promise.all([
    db.from("dot_turns").select("input_tokens, cached_tokens, output_tokens").gte("created_at", since).limit(20000),
    db.from("dot_purchases").select("sku, source, created_at").gte("created_at", since),
    db.from("dot_usage").select("user_id").gte("day", since.slice(0, 10)),
  ]);
  const rows = (t ?? []) as { input_tokens: number; cached_tokens: number; output_tokens: number }[];
  const modelKrw = rows.reduce((a, r) => a + ((r.input_tokens - (r.cached_tokens ?? 0)) * IN_USD + (r.cached_tokens ?? 0) * CACHE_USD + r.output_tokens * OUT_USD), 0) * KRW;
  const fixedKrw = DAYS * (10 * KRW / 30);   // Railway ≈ $10/월
  const { SKUS } = await import("../../src/lib/dot/money");
  const won = (s: string) => Number((SKUS[s]?.price ?? "0").replace(/[^0-9]/g, ""));
  let income = 0; const by = { play: 0, ad: 0, manual: 0 } as Record<string, number>;
  for (const r of (p ?? []) as { sku: string; source: string }[]) {
    by[r.source] = (by[r.source] ?? 0) + 1;
    if (r.source === "play") income += won(r.sku) * 0.85;
    else if (r.source === "ad") income += 12;   // KR 보상형 광고 시세 자리표
  }
  const users = new Set(((u ?? []) as { user_id: string }[]).map((x) => x.user_id)).size;
  const loss = modelKrw + fixedKrw - income;
  add("돈(적자 판정)", "사람", users, users >= 10 && loss > 0 ? [`적자 ₩${Math.round(loss).toLocaleString()} — 원가 ₩${Math.round(modelKrw + fixedKrw).toLocaleString()} > 수입 ₩${Math.round(income).toLocaleString()}`] : [],
    `모델 ₩${Math.round(modelKrw).toLocaleString()} + 고정 ₩${Math.round(fixedKrw).toLocaleString()} · 수입 ₩${Math.round(income).toLocaleString()} (결제 ${by.play ?? 0} · 광고 ${by.ad ?? 0} · 손 ${by.manual ?? 0}) · 사람 ${users}명${users < 10 ? " — 10명 미만이라 적자 판정은 안 한다" : ""}`);
}

// 10) 게시물 — 공개 캐릭터마다 하루 하나
{
  const [{ data: posts }, { count: likes }] = await Promise.all([
    db.from("dot_posts").select("character_id, published_on").gte("published_on", since.slice(0, 10)),
    db.from("dot_post_likes").select("post_id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  const n = (posts ?? []).length;
  const firstDay = (posts ?? []).map((x) => x.published_on as string).sort()[0];
  const daysSince = firstDay ? Math.min(DAYS, Math.floor((Date.parse(todayKST()) - Date.parse(firstDay)) / 86_400_000) + 1) : 0;
  // 오늘은 아직 안 끝났다 — 올리는 시각이 지난 인물만 오늘 몫으로 센다(88회차: 15시에 "5/6" 이라고 울었다).
  const { postMinute } = await import("../../src/lib/dot/posts");
  const k = new Date(Date.now() + 9 * 3_600_000); const nowMin = k.getUTCHours() * 60 + k.getUTCMinutes();
  const { data: slugs } = await db.from("dot_characters").select("slug").eq("is_public", true);
  const dueToday = ((slugs ?? []) as { slug: string }[]).filter((c) => postMinute(c.slug, todayKST()) <= nowMin).length;
  const expected = daysSince > 0 ? (chars ?? []).length * (daysSince - 1) + dueToday : 0;
  add("게시물", "게시물", n, expected >= 4 && n / expected < 0.9 ? [`올린 것 ${n}/${expected} (<90%)`] : [], expected ? `${daysSince}일 × 공개 ${(chars ?? []).length}명 = ${expected} 중 ${n} · 좋아요 ${likes ?? 0}` : "아직 게시물이 없다");
}

// 11) 멘헤라 — 보고만
{
  const [{ data: ents }, { count: on }] = await Promise.all([
    db.from("dot_entitlements").select("menhera_until").gt("menhera_until", new Date().toISOString()),
    db.from("dot_bonds").select("user_id", { count: "exact", head: true }).eq("mode", "menhera"),
  ]);
  add("멘헤라", "자격", (ents ?? []).length, [], `살아 있는 자격 ${(ents ?? []).length} · 켜 둔 사이 ${on ?? 0}`);
}

// ── 보고 ──
const mark = (l: Line) => (l.looked === 0 ? "◻︎" : l.bad.length ? "✗" : "✓");
const out: string[] = [`# 두근도트 자가진단 — 최근 ${DAYS}일 (${new Date().toISOString().slice(0, 16).replace("T", " ")})`, "", "줄마다 **몇 개를 봤는지** 적는다. 0개를 보고 통과라고 말하지 않는다.", ""];
for (const l of lines) {
  out.push(`## ${mark(l)} ${l.name} — ${l.unit} ${l.looked}개를 봄, 걸린 것 ${l.bad.length}개`);
  if (l.note) out.push(`> ${l.note}`);
  if (l.looked === 0) out.push("- **못 잼**: 볼 것이 없었다. 통과가 아니다.");
  for (const b of l.bad) out.push(`- ${b}`);
  out.push("");
}
out.push(`**요약**: 줄 ${lines.length}개 중 걸린 것 ${lines.filter((l) => l.bad.length).length}개, 못 잰 것 ${lines.filter((l) => l.looked === 0).length}개.`);
const text = out.join(NL);
console.log(text);
mkdirSync("engine/docs", { recursive: true });
writeFileSync("engine/docs/dot-selfcheck-latest.md", text, "utf8");
console.log(NL + "→ engine/docs/dot-selfcheck-latest.md");
