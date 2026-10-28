/**
 * **타로가 같은 날 같은 카드를 주나** (10-28). 모델 0 · 값 0 · DB 0.
 *   npx tsx engine/work/probe/tarot-test.mts [--sabotage]
 *
 * 저장을 안 하므로 **함수가 곧 저장소**다. 흔들리면 사람이 새로고침해서 마음에 드는 카드를
 * 뽑을 때까지 돌린다 — 그 순간 "하루 한 장" 이 사라진다. 그래서 거기를 제일 세게 잰다.
 */
import { cardFor, cardText, collectionFor, dayKey, TAROT, type Deck } from "../../../src/lib/dot/tarot";

const 심기 = process.argv.includes("--sabotage");
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => {
  if (!ok) 나쁨++;
  console.log((ok ? "통과" : "실패") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본)));
};

/* 심은 판: 부를 때마다 달라지는 뽑기. 자가 멀쩡하면 "같은 날 같은 카드" 가 떨어져야 한다. */
const 뽑기 = 심기
  ? (_w: string, _d: string, _k: Deck) => TAROT[Math.floor(Math.random() * TAROT.length)]
  : cardFor;

/* ── ① 같은 날이면 늘 같은 카드 ── */
const 백번 = new Set(Array.from({ length: 100 }, () => 뽑기("user-가", "2026-10-28", "white").id));
재기("같은 사람·같은 날 100번 → 한 장", 백번.size === 1, { 나온장수: 백번.size });

/* ── ② 사람이 다르면 보통 다르다 ── */
const 사람들 = Array.from({ length: 40 }, (_, i) => 뽑기(`user-${i}`, "2026-10-28", "white").id);
재기("사람 40명이 한 장에 몰리지 않는다", new Set(사람들).size >= 8, { 서로다른장수: new Set(사람들).size });

/* ── ③ 날이 바뀌면 바뀐다 ── */
const 날들 = Array.from({ length: 40 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 1) + i * 86400000).toISOString().slice(0, 10);
  return 뽑기("user-가", d, "white").id;
});
재기("40일이 한 장에 몰리지 않는다", new Set(날들).size >= 8, { 서로다른장수: new Set(날들).size });
재기("어제와 오늘이 늘 같지는 않다", 날들.some((x, i) => i > 0 && x !== 날들[i - 1]));

/* ── ④ 블랙 덱은 다른 흐름 ── */
if (!심기) {
  const 흰 = Array.from({ length: 30 }, (_, i) => cardFor("user-가", `2026-10-${String(i + 1).padStart(2, "0")}`, "white").id);
  const 검 = Array.from({ length: 30 }, (_, i) => cardFor("user-가", `2026-10-${String(i + 1).padStart(2, "0")}`, "black").id);
  재기("블랙 덱이 흰 덱을 그대로 베끼지 않는다", 흰.some((x, i) => x !== 검[i]), { 같은날겹침: 흰.filter((x, i) => x === 검[i]).length });
}

/* ── ⑤ 22장이 다 나올 수 있나 — 안 나오는 카드는 없는 카드다 ── */
const 닿은것 = new Set<number>();
for (let i = 0; i < 3000; i++) 닿은것.add(cardFor(`u${i}`, "2026-10-28", "white").id);
재기("22장 전부 나올 수 있다", 닿은것.size === TAROT.length, { 닿은장수: 닿은것.size, 전체: TAROT.length });

/* ── ⑥ 카드마다 글과 그림이 다 있나 ── */
const 빈글 = TAROT.filter((c) => (["ko", "en"] as const).some((l) => (["white", "black"] as const).some((k) => !cardText(c, k, l)?.trim())));
재기("카드마다 글 네 개가 다 있다", 빈글.length === 0, { 빈카드: 빈글.map((c) => c.ko) });
const 그림틀림 = TAROT.filter((c) => c.pixels.length !== 8 || c.pixels.some((r) => r.length !== 8));
재기("도트가 전부 8×8", 그림틀림.length === 0, { 틀린카드: 그림틀림.map((c) => c.ko) });
const 빈그림 = TAROT.filter((c) => !c.pixels.join("").includes("#"));
재기("빈 그림이 없다", 빈그림.length === 0, { 빈카드: 빈그림.map((c) => c.ko) });
재기("id 가 안 겹친다", new Set(TAROT.map((c) => c.id)).size === TAROT.length);

/* ── ⑦ 도감은 날이 갈수록 는다 ── */
if (!심기) {
  const 칠일 = collectionFor("user-가", "white", 7, "2026-10-28").filter((x) => x.seen).length;
  const 육십일 = collectionFor("user-가", "white", 60, "2026-10-28").filter((x) => x.seen).length;
  재기("오래 올수록 많이 모인다", 육십일 > 칠일, { "7일": 칠일, "60일": 육십일 });
  재기("7일에 7장을 넘지 않는다", 칠일 <= 7, { "7일": 칠일 });
}

/* ── ⑧ 날짜는 한국 시간으로 ── */
재기("자정 직후 UTC 는 이미 다음 날", dayKey(new Date("2026-10-28T15:30:00Z")) === "2026-10-29",
  { 잰값: dayKey(new Date("2026-10-28T15:30:00Z")) });
재기("낮 시간은 그날", dayKey(new Date("2026-10-28T03:00:00Z")) === "2026-10-28");

if (심기) {
  console.log(나쁨 ? `\n심은 판에서 ${나쁨}개 잡았다 — 자가 산다` : "\n**심었는데 다 통과했다 — 자가 눈멀었다**");
  process.exit(나쁨 ? 0 : 1);
}
console.log(나쁨 ? `\n**${나쁨}개 실패**` : "\n전부 통과");
process.exit(나쁨 ? 1 : 0);
