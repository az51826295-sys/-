/**
 * **도윤 출시 인스타 — 영어** (10-28 사장님 "새 캐릭터 출시하고 인스타", 영어로).
 *   AI_PROVIDER=openai npx tsx engine/work/probe/gram-doyun-en.mts
 *
 * Gram(인스타 담당)은 로키 직원이라 로키 DB 가 있어야 도는데 **그 DB 가 없다**(ENOTFOUND,
 * [[rookery-prod-db-is-gone]]). 그래서 직원 대신 여기서 같은 일을 하되, **자는 Gram 것을 그대로
 * 빌린다**(`judgePost`) — 자를 새로 쓰면 무엇을 통과시켰는지 비교할 수 없다.
 *
 * ## 그림을 새로 만들지 않는다
 *
 * Gram 은 보통 그림 AI 에 주문을 넣는다. 여기서는 **도윤의 실제 그림**을 정사각으로 짠다.
 * 까닭 둘: (1) 광고에 그 캐릭터가 아닌 그림을 쓰면 받는 사람이 속는다, (2) 그림은 사장님 칸이다
 * ([[creative-direction-is-users]]). 도트 그림이라 **nearest** 로 키운다 — 뭉개면 도트가 아니다.
 *
 * ## 가게 링크를 안 넣는다
 *
 * 플레이에 공개된 판은 옛 1.0.7 이고 그게 로키를 열 수도 있다([[dot-keystore-password-lost]]).
 * 받으러 간 사람이 엉뚱한 앱을 보면 광고가 아니라 사고다. **첫 줄 후보는 사장님이 고른다.**
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
import sharp from "sharp";
import { z } from "zod";
import { defaultProviders } from "../../../src/lib/execution/shared";
import { judgePost } from "../../../src/lib/skills/socialPost";

const OUT = "C:/Users/az518/Desktop/두근도트-인스타/도윤-영어";
mkdirSync(OUT, { recursive: true });
const NL = String.fromCharCode(10);

/* ── 주문. "- " 줄만 **쓸 수 있는 사실**이다(Gram 과 같은 읽기). 전부 오늘 확인한 것만 적는다. ── */
const ask = [
  "Instagram post in English announcing a new character in the pixel chat app 두근도트 (Dot).",
  "",
  "- Doyun is a new character released today in the pixel chat app Dot",
  "- Doyun is always working late at the office and talks like someone too tired to pretend",
  "- Dot now speaks English, not only Korean",
  "- There are seven characters to talk to",
  "- Chatting is free with a daily limit",
  "- The art is pixel art and each character shows six expressions",
  "",
  "Do not mention app stores or download links.",
  "Write the caption and the hashtags in English.",
].join(NL);

/* ── 그림: 도윤의 진짜 그림을 1080 정사각으로 ── */
const SIDE = 1080;
async function 정사각(원본: string, 나갈곳: string) {
  const src = sharp(원본);
  const { width = 1, height = 1 } = await src.metadata();
  /* 높이를 꽉 채우고 좌우를 배경으로 메운다. **nearest** — 도트는 흐려지면 안 된다. */
  const 배수 = Math.floor(SIDE / height);
  const w = width * 배수, h = height * 배수;
  const 키움 = await sharp(원본).resize(w, h, { kernel: "nearest" }).png().toBuffer();
  /* 배경색은 **그림에서 뽑는다** — 내가 고르면 그림마다 다른 색을 고르게 된다. */
  const { dominant } = await sharp(원본).stats();
  await sharp({
    create: { width: SIDE, height: SIDE, channels: 3, background: dominant },
  }).composite([{ input: 키움, gravity: "center" }]).png().toFile(나갈곳);
}

const 그림들: { bytes: Uint8Array; path: string }[] = [];
for (const n of [1, 2]) {
  const p = `${OUT}/doyun-${n}.png`;
  await 정사각(`public/dot-sprites/doyun/photo/${n}.png`, p);
  그림들.push({ bytes: readFileSync(p), path: p });
}

/* ── 글: Gram 의 계획 모양 그대로 ── */
const plan = z.object({
  title: z.string(),
  hook: z.string().describe("First line of the caption, in English. 125 characters or fewer."),
  hookAlts: z.array(z.string()).describe("Two more first-line candidates, English, each 125 characters or fewer."),
  caption: z.string().describe("The whole caption in English, starting with the hook. 2200 characters or fewer. Line breaks so it breathes. Few emoji."),
  hashtags: z.array(z.string()).describe("5-15 English hashtags, each '#oneword', no duplicates."),
  imagePrompt: z.string().describe("Not used here (the real character art is used) — say so in one line."),
  variants: z.number().int().min(1).max(3),
  why: z.string().describe("One line in Korean for 사장님: what tone you wrote it in."),
});

const ai = defaultProviders().ai;
const out = await ai.generateStructuredOutput({
  systemInstructions: [
    "You write Instagram posts. You are given facts and you use only those facts.",
    "- Never invent a number, a date, a price, or a claim that is not in the order.",
    "- The first line is all anyone sees before 'more' — it has to earn the tap.",
    "- Write like a person, not a brochure. No corporate voice, no exclamation marks in every line.",
    "- `variants` must be 2 (two images are attached).",
    "- `why` is written in Korean.",
  ].join(NL),
  input: ask,
  schema: plan, schemaName: "gram_post", maxTokens: 2000, tier: "conversation",
});

const p = out.output;
const 검사 = judgePost(ask, p, 그림들);

console.log(`첫 줄(${p.hook.length}자): ${p.hook}`);
console.log(`후보: ${p.hookAlts.map((h, i) => `${NL}  ${i + 2}) ${h}`).join("")}`);
console.log(`${NL}본문 ${p.caption.length}자 · 해시태그 ${p.hashtags.length}개`);
console.log(`${NL}── 자 ──`);
let 나쁨 = 0;
for (const c of 검사) { if (c.result === "Failed") 나쁨++; console.log(`${c.result === "Passed" ? "맞음  " : "어긋남"} ${c.name}  (${c.message})`); }

writeFileSync(`${OUT}/올릴것.md`, [
  "# 도윤 출시 — 인스타(영어)", "",
  "사진 2장: `doyun-1.png`, `doyun-2.png` (1080×1080, 도윤의 실제 그림)", "",
  "## 첫 줄 — **사장님이 고르세요**", "",
  ...[p.hook, ...p.hookAlts].map((h, i) => `${i + 1}. ${h}`), "",
  "## 본문", "", "```", p.caption, "```", "",
  "## 해시태그", "", p.hashtags.join(" "), "",
  `## 어떤 결로 썼나`, "", p.why, "",
  "## 자", "", ...검사.map((c) => `- ${c.result === "Passed" ? "맞음" : "**어긋남**"} ${c.name} — ${c.message}`), "",
  "> 가게 링크는 일부러 안 넣었습니다. 플레이에 올라간 판이 옛 1.0.7 이라 받으러 간 사람이 엉뚱한 앱을 볼 수 있습니다.",
].join(NL), "utf8");

console.log(`${NL}적음: ${OUT}/올릴것.md`);
process.exit(나쁨 === 0 ? 0 : 1);
