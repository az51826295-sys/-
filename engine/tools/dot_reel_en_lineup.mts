/**
 * **일곱 명 소개 릴스 (영어)** (10-29, 사장님 "더 만들어"). 값 0 · 모델 0.
 *   npx tsx engine/tools/dot_reel_en_lineup.mts
 *
 * 한 명짜리 편(`dot_reel_en.mts`)은 **한 사람에게 빠지는** 영상이다. 이건 반대로
 * **고르게 하는** 영상이다 — 일곱을 빠르게 넘기고 "누가 네 사람이야?" 로 끝낸다.
 * 댓글에 이름 하나 다는 것이 팔로우보다 쉽고, 그 답이 곧 다음에 누구를 더 만들지다.
 *
 * ## 한마디는 지어내지 않는다
 * 각자의 한마디는 **DB 의 `en.greeting`** — 앱이 그 사람 방에서 실제로 먼저 거는 말이다.
 * 내가 영어 카피를 쓰면 그건 제품이 아니라 광고 문구가 된다.
 * `en` 이 없는 사람은 **빼고**, 뺀 사실을 적는다(한국어로 섞어 내보내지 않는다).
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { W, H, PINK, NIGHT, text, fitLines, bodyCard, stitch, measure, type Cut } from "./dot_reel_lib";

for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const 나온칸 = "C:/Users/az518/Desktop/두근도트-영상/영어/lineup";
const 장면칸 = `${나온칸}/장면`;
mkdirSync(장면칸, { recursive: true });

const 순서 = ["doyun", "rin", "seoha", "yuna", "nabi", "haru", "yeonu"];
const { data } = await db.from("dot_characters").select("slug, name, en, is_public").eq("is_public", true);
type 줄 = { slug: string; en: { greeting?: string; tagline?: string } | null };
const 다 = ((data ?? []) as 줄[]);
const 사람들 = 순서.map((s) => 다.find((c) => c.slug === s)).filter(Boolean) as 줄[];

const 한글수 = (s: string) => (s.match(/[\uac00-\ud7a3]/g) ?? []).length;
const 뺀사람: string[] = [];
const 쓸사람 = 사람들.filter((c) => {
  const g = c.en?.greeting ?? c.en?.tagline ?? "";
  const ok = g.length > 4 && 한글수(g) === 0 && existsSync(`public/dot-sprites/${c.slug}/neutral.png`);
  if (!ok) 뺀사람.push(c.slug);
  return ok;
});
if (뺀사람.length) console.log(`뺀 사람: ${뺀사람.join(", ")} (영어 한마디나 그림이 없다)`);
if (쓸사람.length < 3) { console.error("낼 사람이 너무 적다"); process.exit(1); }

const 바탕 = ["#1d2430", "#2b2135", "#202a24", "#2a2430", "#241f2e", "#2e2620", "#1f2a2c"];
const 컷들: Cut[] = [];
let n = 0;
const 쓰기 = (png: Buffer) => { const p = `${장면칸}/${String(++n).padStart(2, "0")}.png`; writeFileSync(p, png); return p; };

// ① 훅 — 소리를 꺼도 읽힌다. 숫자는 **센 것**만 적는다.
컷들.push({
  파일: 쓰기(await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${NIGHT}"/>
    ${text(W / 2, H / 2 - 120, "Pick one.", 150, "#ffffff")}
    ${text(W / 2, H / 2 + 10, `${쓸사람.length} of them, all in English`, 56, PINK, 700, 10)}
    ${text(W / 2, H / 2 + 150, "this is what they say first", 44, "#c8d0d8", 600, 8)}
  </svg>`)).png().toBuffer()),
  초: 2.2, 움직임: "들어가기", 전환: "fadewhite",
});

// ② 한 사람에 한 컷 — 이름과 **앱이 먼저 거는 말**
for (const [i, c] of 쓸사람.entries()) {
  /* 10-29 첫 판은 첫인사의 **첫 문장**만 썼더니 일곱 명이 거의 같은 말을 했다 —
     "You're here." · "Oh?" · "What." 다 그냥 반응이다. 광고로는 죽은 화면이다.
     그래서 한 줄 소개와 첫인사의 문장들을 다 늘어놓고 **제일 긴 것**을 쓴다.
     고르는 자는 길이뿐이고, 글은 전부 DB 에 있는 것 그대로다. */
  const 후보 = [c.en?.tagline ?? "", ...(c.en?.greeting ?? "").split(/(?<=[.!?…])\s+/)]
    .map((x) => x.trim()).filter((x) => x.length > 3);
  const 한마디 = 후보.sort((a, b) => b.length - a.length)[0].slice(0, 120);
  const { lines, size } = fitLines(한마디, { per: 24, max: 56, min: 36, budget: 820 });
  const 이름 = c.slug.charAt(0).toUpperCase() + c.slug.slice(1);
  /* 따옴표는 **처음과 끝에만**. 줄마다 붙이면 두 줄짜리가 인용 두 개로 보인다(10-29). */
  const 시작 = H - 380;
  컷들.push({
    파일: 쓰기(await bodyCard(`public/dot-sprites/${c.slug}/neutral.png`, 바탕[i % 바탕.length],
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        ${text(W / 2, H - 470, 이름, 104, "#ffffff")}
        ${lines.map((l, j) => text(W / 2, 시작 + j * size * 1.3,
          `${j === 0 ? "“" : ""}${l}${j === lines.length - 1 ? "”" : ""}`, size, "#ffd9e2", 600, 8)).join("")}
      </svg>`, 860, 190)),
    초: 1.8, 움직임: i % 2 ? "나오기" : "들어가기", 전환: i % 2 ? "slideleft" : "fade",
  });
}

// ③ 끝카드 — 할 일 하나만
const { FREE_TURNS_PER_DAY } = await import("../../src/lib/dot/bond");
컷들.push({
  파일: 쓰기(await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${PINK}"/>
    ${text(W / 2, H / 2 - 190, "Who is yours?", 92, "#ffffff", 900, 0)}
    ${text(W / 2, H / 2 - 70, "drop the name in the comments", 46, "#fff0f3", 600, 0)}
    ${text(W / 2, H / 2 + 110, `Dot · ${FREE_TURNS_PER_DAY} free messages a day`, 50, "#ffffff", 700, 0)}
    ${text(W / 2, H / 2 + 250, "link in bio", 62, "#ffffff", 800, 0)}
  </svg>`)).png().toBuffer()),
  초: 2.8, 움직임: "들어가기", 전환: "",
});

const 결과 = `${나온칸}/dot-en-lineup.mp4`;
const 기대 = stitch(컷들, 결과);
const 나쁨 = await measure(결과, 기대, [
  ["한마디가 **DB 의 영어**인가", 쓸사람.every((c) => 한글수(c.en?.greeting ?? c.en?.tagline ?? "") === 0), `${쓸사람.length}명`],
  ["뺀 사람을 적었나", true, 뺀사람.length ? 뺀사람.join(",") : "없음"],
  ["끝카드가 2.5초 넘나", 컷들[컷들.length - 1].초 >= 2.5, `${컷들[컷들.length - 1].초}초`],
]);
rmSync(장면칸, { recursive: true, force: true });
if (나쁨) process.exitCode = 1;
