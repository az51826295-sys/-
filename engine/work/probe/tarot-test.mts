/**
 * **타로가 같은 날 같은 카드를 주나** (10-28). 모델 0 · 값 0 · DB 0.
 *   npx tsx engine/work/probe/tarot-test.mts [--sabotage]
 *
 * 저장을 안 하므로 **함수가 곧 저장소**다. 흔들리면 사람이 새로고침해서 마음에 드는 카드를
 * 뽑을 때까지 돌린다 — 그 순간 "하루 한 장" 이 사라진다. 그래서 거기를 제일 세게 잰다.
 */
import { cardFor, cardText, collectionFor, dayKey, TAROT, type Deck , markFlipped, flippedDays } from "../../../src/lib/dot/tarot";

const 심기 = process.argv.includes("--sabotage");
/* `--sabotage2` 는 **옛 고장을 그대로 되돌린다** — 지난 90일을 해시로 되짚어 세는 것.
   그게 처음 켠 사람에게 22/22 를 보여 주던 코드다. 자가 이걸 못 잡으면,
   다음에 누가 같은 코드를 되살려도 아무도 모른다. */
const 심기2 = process.argv.includes("--sabotage2");
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

/* ── ⑦ 도감은 **내가 뒤집은 날**에서 온다 ───────────────────────────
 *
 * 10-28 고침. 전에는 지난 90일을 해시로 되짚어 세었고, **이 자가 그걸 정답으로
 * 지키고 있었다**("오래 올수록 많이 모인다"). 그런데 카드가 22장인데 90일을 훑으니
 * **처음 켠 사람에게도 22/22** 가 떴다 — 자가 거짓말을 지키고 있었던 것이다.
 * 자가 틀렸을 때는 자를 고친다([[secretary-voice]] 에서 두 번 겪었다). */
const 진짜모음 = collectionFor;
const 모음재기 = 심기2
  ? (who: string, deck: Deck, _본날: string[]) => {
      const t = new Date("2026-10-28T00:00:00Z");
      const days = Array.from({ length: 90 }, (_, i) =>
        new Date(t.getTime() - i * 86400000).toISOString().slice(0, 10));
      return 진짜모음(who, deck, days);
    }
  : 진짜모음;
const 날 = (n: number) => new Date(Date.UTC(2026, 9, 28) - n * 86400000).toISOString().slice(0, 10);
{
  재기("아무것도 안 뒤집었으면 0장", 모음재기("user-가", "white", []).filter((x) => x.seen).length === 0);
  const 사흘 = 모음재기("user-가", "white", [날(0), 날(1), 날(2)]).filter((x) => x.seen);
  재기("사흘 뒤집으면 3장을 넘지 않는다", 사흘.length <= 3, { 모은것: 사흘.length });
  재기("사흘 뒤집으면 1장 이상", 사흘.length >= 1, { 모은것: 사흘.length });
  const 같은날두번 = 모음재기("user-가", "white", [날(0), 날(0), 날(0)]).filter((x) => x.seen).length;
  재기("같은 날을 여러 번 눌러도 한 장", 같은날두번 === 1, { 모은것: 같은날두번 });
  const 열흘 = 모음재기("user-가", "white", Array.from({ length: 10 }, (_, i) => 날(i))).filter((x) => x.seen).length;
  재기("날이 늘면 줄지 않는다", 열흘 >= 사흘.length, { "3일": 사흘.length, "10일": 열흘 });
  재기("열흘에 10장을 넘지 않는다", 열흘 <= 10, { "10일": 열흘 });
  /* **처음 켠 사람이 22/22 를 보는 것이 고장이었다.** 그 자리를 못으로 박아 둔다. */
  재기("처음 켠 사람은 22장을 다 가지지 않는다",
    모음재기("새사람", "white", []).filter((x) => x.seen).length < TAROT.length);
  /* 모은 날짜는 **처음 받은 날**이어야 한다 — 나중 날로 덮으면 "언제 받았나" 가 틀린다 */
  const 겹침 = 모음재기("user-가", "white", [날(0), 날(1)]).filter((x) => x.seen);
  재기("모은 날이 비어 있지 않다", 겹침.every((x) => x.day), 겹침.map((x) => x.day));
}

/* ── ⑦-2 뒤집은 날 적기 (기기에 남는다) ── */
{
  const 가게: Record<string, string> = {};
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => 가게[k] ?? null,
    setItem: (k: string, v: string) => { 가게[k] = v; },
  };
  재기("처음엔 뒤집은 날이 없다", flippedDays().length === 0);
  markFlipped("2026-10-28");
  재기("뒤집으면 하나 늘고", flippedDays().length === 1, flippedDays());
  markFlipped("2026-10-28");
  재기("같은 날은 두 번 안 늘고", flippedDays().length === 1, flippedDays());
  markFlipped("2026-10-29");
  재기("다른 날은 는다", flippedDays().length === 2, flippedDays());
  가게["dot_tarot_flipped"] = "{망가진 값";
  재기("저장된 값이 깨져 있어도 안 터진다", flippedDays().length === 0);
  delete (globalThis as Record<string, unknown>).localStorage;
  재기("localStorage 가 없어도 안 터진다", flippedDays().length === 0);
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
