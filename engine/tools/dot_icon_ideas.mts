/**
 * **앱 아이콘 후보 만들기** (227회차 09-29, 사장님 "앱아이콘이 지금 밋밋하니까 할꺼 추천좀"). 값 0 · 모델 0.
 *
 *   npx tsx engine/tools/dot_icon_ideas.mts
 *
 * 지금 아이콘이 밋밋한 이유는 **단색 바탕 + 얼굴 하나**뿐이기 때문이다. 아이콘이 눈에 띄는 것은
 * 대개 셋 중 하나다: ① 또렷한 테두리 ② 바탕에 결(무늬·두 색) ③ 이 앱이 뭔지 알려 주는 모양 하나.
 * 말로만 고르기 어려우니 **만들어서 보여 준다** — 고르는 것은 사장님 몫이다([[creative-direction-is-users]]).
 *
 * 규칙 둘은 지킨다(09-29 에 쟀던 것):
 *  · **글자를 안 넣는다** — 폰 바탕화면에서 아이콘은 엄지손톱만 하다.
 *  · **안전 원 안에** 둔다 — 안드로이드는 가운데 66% 만 반드시 보인다. 만든 뒤 다시 잰다.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const OUT = "C:/Users/az518/Desktop/두근도트-아이콘후보";
mkdirSync(OUT, { recursive: true });
const S = 512;                                   // 만드는 크기(도트라 나중에 정수배로 줄인다)
const 노랑 = { r: 254, g: 229, b: 0 };
const 분홍 = { r: 255, g: 92, b: 122 };          // 앱이 이미 쓰는 강조색
const 먹 = { r: 28, g: 28, b: 28 };

/** 원본에서 **얼굴만** 떼어 낸다 — 바탕 노랑을 지운다. 바탕을 바꾸려면 얼굴이 따로 있어야 한다. */
async function 얼굴만(): Promise<Buffer> {
  const 원 = sharp(readFileSync("public/dot-icon-512.png")).ensureAlpha();
  const { data, info } = await 원.raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  for (let p = 0; p < data.length; p += ch) {
    // 바탕 노랑과 가까우면 투명하게. 얼굴 안에는 이 노랑이 없다(머리·피부·옷뿐).
    if (Math.abs(data[p] - 노랑.r) + Math.abs(data[p + 1] - 노랑.g) + Math.abs(data[p + 2] - 노랑.b) < 60) data[p + 3] = 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** 도트 격자로 무늬를 그린다. 칸 수를 적게 잡아야 **도트로 보인다**(부드러운 그라데이션은 도트가 아니다). */
function 무늬(칸: number, 칠하기: (x: number, y: number) => { r: number; g: number; b: number }): Promise<Buffer> {
  const buf = Buffer.alloc(칸 * 칸 * 4);
  for (let y = 0; y < 칸; y++) for (let x = 0; x < 칸; x++) {
    const c = 칠하기(x, y), p = (y * 칸 + x) * 4;
    buf[p] = c.r; buf[p + 1] = c.g; buf[p + 2] = c.b; buf[p + 3] = 255;
  }
  return sharp(buf, { raw: { width: 칸, height: 칸, channels: 4 } })
    .resize(S, S, { kernel: "nearest" }).png().toBuffer();
}

const 얼굴 = await 얼굴만();
/** 얼굴을 칸 안에 넣는다. 비율은 화면에서 차지할 크기. */
async function 얹기(바탕: Buffer, 비율: number, 아래로 = 0): Promise<Buffer> {
  const 속 = Math.round(S * 비율);
  const 작게 = await sharp(얼굴).resize(속, 속, { kernel: "nearest" }).toBuffer();
  return sharp(바탕).composite([{ input: 작게, left: Math.round((S - 속) / 2), top: Math.round((S - 속) / 2) + 아래로 }]).png().toBuffer();
}

/**
 * **얼굴이 안전 원 밖으로 나가나** — 잘리면 안 되는 것은 얼굴이지 바탕이 아니다.
 *
 * 첫 판에서는 "바탕색이 아닌 점" 을 전부 그림으로 셌다. 그러니 **두 색 바탕·무늬 바탕**에서는
 * 바탕의 절반이 그림으로 세어져 50% 가 나왔다 — 자가 틀린 것을 재고 있었다
 * ([[measure-the-thing-not-a-proxy]]). 얼굴 층만 따로 놓고 잰다.
 */
async function 얼굴재기(비율: number, 아래로 = 0): Promise<string> {
  const 속 = Math.round(S * 비율);
  const 작게 = await sharp(얼굴).resize(속, 속, { kernel: "nearest" }).toBuffer();
  const 층 = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: 작게, left: Math.round((S - 속) / 2), top: Math.round((S - 속) / 2) + 아래로 }])
    .png().toBuffer();
  const { data, info } = await sharp(층).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, W = info.width, H = info.height;
  const cx = (W - 1) / 2, cy = (H - 1) / 2, r = Math.min(W, H) * 0.33;
  let n = 0, 밖 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * ch;
    if (data[p + 3] < 128) continue;
    n++; if (Math.hypot(x - cx, y - cy) > r) 밖++;
  }
  return n ? `${((밖 / n) * 100).toFixed(1)}%` : "—";
}

/** [이름, 설명, 그림, 얼굴비율, 아래로] — 자가 얼굴만 재려면 어디에 얹었는지 알아야 한다. */
const 후보: [string, string, Promise<Buffer>, number, number][] = [
  ["A-지금것", "단색 노랑 + 얼굴. 대조군.", 얹기(await 무늬(1, () => 노랑), 0.74), 0.74, 0],

  ["B-두색대각", "노랑·분홍을 도트 계단으로 갈랐다. 바탕에 결이 생겨 멀리서도 눈에 띈다.",
    얹기(await 무늬(16, (x, y) => (x + y < 16 ? 노랑 : 분홍)), 0.74), 0.74, 0],

  ["C-체크무늬", "옅은 체크. 도트 게임 느낌이 나고 얼굴이 떠 보인다.",
    얹기(await 무늬(16, (x, y) => ((x + y) % 2 ? 노랑 : { r: 240, g: 214, b: 0 })), 0.74), 0.74, 0],

  ["D-굵은테두리", "먹색 도트 테두리. 밝은 배경 화면에서 아이콘이 안 묻힌다.",
    얹기(await 무늬(16, (x, y) => (x < 1 || y < 1 || x > 14 || y > 14 ? 먹 : 노랑)), 0.70), 0.70, 0],

  ["E-하트배지", "오른쪽 아래에 도트 하트. '두근' 이라는 이름과 맞고, 채팅앱 티가 난다.",
    (async () => {
      const 바탕 = await 무늬(16, () => 노랑);
      const 하트 = await 무늬(8, (x, y) => {
        const 모양 = [
          "01100110", "11111111", "11111111", "11111111",
          "01111110", "00111100", "00011000", "00000000",
        ];
        return 모양[y][x] === "1" ? 분홍 : 노랑;
      });
      const 얼굴얹음 = await 얹기(바탕, 0.68, -18);
      const 작은하트 = await sharp(하트).resize(Math.round(S * 0.26), Math.round(S * 0.26), { kernel: "nearest" }).toBuffer();
      return sharp(얼굴얹음).composite([{ input: 작은하트, left: Math.round(S * 0.62), top: Math.round(S * 0.62) }]).png().toBuffer();
    })(), 0.68, -18],

  ["F-말풍선", "얼굴이 말풍선 안에 있다. 아이콘만 보고도 '대화하는 앱' 인 줄 안다.",
    (async () => {
      const 말풍선 = await 무늬(16, (x, y) => {
        const 안 = x >= 2 && x <= 13 && y >= 2 && y <= 11;
        const 꼬리 = y >= 12 && y <= 13 && x >= 4 && x <= 5 + (13 - y);
        return 안 || 꼬리 ? { r: 255, g: 255, b: 255 } : 노랑;
      });
      return 얹기(말풍선, 0.60, -26);
    })(), 0.60, -26],
];

console.log("후보를 만든다 (글자 없음 · 안전 원 안).\n");
for (const [이름, 설명, 일, 비율, 아래로] of 후보) {
  const png = await 일;
  const p = `${OUT}/${이름}.png`;
  writeFileSync(p, png);
  console.log(`${이름.padEnd(10)} 얼굴이 안전원 밖 ${(await 얼굴재기(비율, 아래로)).padStart(6)}  ${설명}`);
}
console.log(`\n→ ${OUT}`);
console.log("고르시면 dot_app_icon.mts 처럼 다섯 크기로 구워 dot-android 에 넣는다.");
