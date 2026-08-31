// UI 초안을 그린다. **한 번 부르면 돈이 나간다.**
//
//   node scripts/draft-ui.mjs [나갈 폴더]
//
// 왜 스크립트인가: 이건 제품 기능이 아니라 **초안을 뽑아 사람에게 보이는
// 일회성 작업**이다. 제품 안에 넣으면 아무도 안 부르는 경로가 하나 늘고,
// 여기 두면 지출이 명령 한 줄에 묶여서 언제 얼마가 나갔는지가 분명하다.
//
// 후보를 여러 장 낸다. 한 장만 뽑아 놓고 "이게 됐다" 고 말하는 것은 고른
// 것이 아니다 — `skills/gameAssets` 가 같은 이유로 여러 장을 그리고 대부분
// 버린다. 여기서도 고르는 것은 사람이다.
import OpenAI from "openai";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const outDir = process.argv[2] ?? "out/ui-draft";
mkdirSync(outDir, { recursive: true });

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2 });
const MODEL = "gpt-image-2";

// 아트 바이블(docs/art-bible-office-draft.md)의 말을 그대로 옮긴다.
// 두 벌로 나눠 두는 이유: 형식은 안 바뀌고 소재만 바뀐다.
const LOOK =
  "Pixel art, HD-2D look inspired by Octopath Traveler but BRIGHT, not dark: " +
  "crisp visible square pixels, dark ink outlines on characters, three-tone " +
  "shading, warm sunlit lighting, limited palette of about eight colours — " +
  "paper cream #F4F1E8 ground, window light #FFF6D8, wood #C9A227, office " +
  "grey #B8BFC7, ink #2B2D36 outlines, one orange accent #E0703A. " +
  "Characters are chibi, two heads tall: the head is as large as the whole " +
  "body below it, big round head, small compact body, large expressive eyes.";

const SHOTS = [
  {
    name: "screen",
    what:
      "A single application window mockup for a chat app called Rookery, seen " +
      "flat and straight on. A wide message area on the left with a few chat " +
      "bubbles, and a narrow status strip near the top showing a small chibi " +
      "office worker sprite with a progress row of four steps. A text input " +
      "box across the bottom. The whole window sits on a cream paper " +
      "background. Clean, readable, uncluttered, no real text — use simple " +
      "pixel bars to suggest words.",
  },
  {
    name: "office",
    what:
      "A tiny bright office diorama seen from a slight angle: three chibi " +
      "office workers two heads tall at their desks, a window with warm " +
      "sunlight falling across a wooden floor, monitors, a filing cabinet, a " +
      "potted plant. Cosy and small, like one room of a game world. No text.",
  },
  {
    name: "cast",
    what:
      "Five chibi office worker characters standing in a row on an empty " +
      "background, two heads tall each, evenly spaced, all facing the viewer " +
      "in one standing pose: one holding a stack of papers with glasses, one " +
      "holding a phone with a raised hand, one holding a colour swatch fan " +
      "wearing an apron, one with a drawing tablet and headphones round the " +
      "neck, one holding a laptop with a mug. No text, no ground shadow.",
  },
];

/** 한 소재에 몇 장. 고르려면 여러 장이어야 한다. */
const CANDIDATES = 2;

let spent = 0;
const made = [];

for (const shot of SHOTS) {
  for (let i = 0; i < CANDIDATES; i++) {
    const label = `${shot.name}-${i + 1}`;
    try {
      const res = await client.images.generate({
        model: MODEL,
        prompt: `${LOOK} ${shot.what}`,
        n: 1,
        size: "1536x1024",
        quality: "medium",
        output_format: "png",
      });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new Error("빈 응답");
      const file = join(outDir, `${label}.png`);
      writeFileSync(file, Buffer.from(b64, "base64"));
      const inTok = res.usage?.input_tokens ?? 0;
      const outTok = res.usage?.output_tokens ?? 0;
      // 코드에 적힌 단가(입력 $5/M, 출력 $40/M)로 그 자리에서 센다.
      const usd = (inTok / 1e6) * 5 + (outTok / 1e6) * 40;
      spent += usd;
      made.push({ label, file, usd });
      console.log(`${label} → ${file}  $${usd.toFixed(4)}`);
    } catch (error) {
      // 한 장이 실패해도 나머지로 계속한다. 넉 장 중 셋이면 아직 고를 수 있다.
      console.log(`${label} 실패: ${error instanceof Error ? error.message : error}`);
    }
  }
}

console.log(`\n${made.length}장 · 합계 약 $${spent.toFixed(4)}`);
if (made.length === 0) process.exitCode = 1;
