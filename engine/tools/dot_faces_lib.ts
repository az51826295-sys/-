/** 얼굴 크롭 — dot_faces.mts · dot_new_character.mts · dot_recut.mts 가 같이 쓴다(39회차에 떼어냄). */
import sharp from "sharp";
/**
 * **얼굴도 진짜 도트여야 한다** (11-10).
 *
 * `truedot` 을 만들고 제일 먼저 제품에 대 봤더니 얼굴 스프라이트의 격자가 **1.6화소**였다 —
 * 도트가 아니었다. 범인은 아래 크롭의 마지막 한 줄이다: 아무 자리에서 아무 크기로 잘라
 * **96 으로 줄였다**(512 스프라이트에서 보통 296px → 96px, 비율 0.32). 비정수로 줄이면
 * 칸이 깨진다. 몸은 도트 4 인데 얼굴만 도트 1.6 이면 같은 사람으로 안 보인다
 * ([[dot-character-standard]] 가 스프라이트에만 걸려 있었다).
 *
 * 고친 규칙 셋:
 *  1. **칸 수로 자른다** — 72칸. 전에 쓰던 틀(실루엣 높이의 0.62배 ≈ 74칸)과 거의 같다.
 *     32칸으로 좁혀 봤더니 눈·입이 잘렸다 — **틀은 여러 판 돌려 맞춘 것이라 건드리지 않는다.**
 *  2. **자리를 칸에 맞춘다** — 왼쪽·위를 도트 크기의 배수로 내린다.
 *  3. **줄이지 않는다** — 자른 그대로 내보낸다(512 스프라이트면 128×128, 도트 4).
 *
 * 그래서 얼굴은 **논리 32칸**이다. 화면에서 64·96px 로 쓰면 한 칸이 2·3화소라 딱 떨어진다.
 */
export const FACE_CELLS = 72;
/** 512 스프라이트(도트 4) 기준 얼굴 그림 크기 = 72칸 × 4. 자른 그대로라 격자가 안 깨진다. */
export const FACE_PX = 288;

/**
 * 얼굴 크롭 — 실루엣으로 자리를 잡고, **살색으로 눈높이를 맞춘다.**
 *
 * 1판(살색 상자): 유나의 크림 스웨터가 살색으로 잡혀 흉상 전체가 얼굴이 됐다.
 * 2판(실루엣 0.36H): 린의 포니테일·도윤의 뻗친 머리가 실루엣 꼭대기를 끌어올려 얼굴이 아래로 밀렸다 — 입이 잘렸다(09-11 사장님 "유나 린 표정 잘 안 됐다").
 * 3판(지금): 실루엣 **위쪽 58% 띠 안에서만** 살색을 찾는다(스웨터는 그 아래). 살색 상자의 가운데가 얼굴 가운데,
 *   변은 살색 높이의 2.1배(이마·머리·턱이 들어오게). 살색이 안 잡히면 2판으로 물러난다.
 */
// 도트 살색은 아주 연하다(250,230,210 쯤) — r-b 가 20~30 밖에 안 난다. 붉은 순서(r≥g≥b)와 밝기로 잡고, 흰색(r-b<12)은 뺀다.
const isSkin = (r: number, g: number, b: number, a: number) => a > 128 && r > 185 && g > 135 && b > 100 && r >= g && g >= b && (r - b) >= 12 && (r - b) <= 110;

export async function faceCrop(png: Buffer): Promise<Buffer> {
  const meta = await sharp(png).metadata(); const S = meta.width ?? 512;
  const G = 128;
  const { data, info } = await sharp(png).resize(G, G, { kernel: "nearest", fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let top = G, bot = -1, left = G, right = -1;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    if (data[(y * G + x) * ch + 3] > 128) { top = Math.min(top, y); bot = Math.max(bot, y); left = Math.min(left, x); right = Math.max(right, x); }
  }
  const k = S / G;
  const Hs = (bot - top + 1), H = Hs * k, cx0 = ((left + right + 1) / 2) * k, y0 = top * k;

  // 살색 상자 — 실루엣 위 58% 띠 안에서만
  let st = G, sb = -1, sl = G, sr = -1, n = 0;
  const band = top + Math.round(Hs * 0.52);   // 턱 아래(옷깃·스웨터)는 안 본다
  for (let y = top; y <= Math.min(bot, band); y++) for (let x = 0; x < G; x++) {
    const p = (y * G + x) * ch;
    if (isSkin(data[p], data[p + 1], data[p + 2], data[p + 3])) { n++; st = Math.min(st, y); sb = Math.max(sb, y); sl = Math.min(sl, x); sr = Math.max(sr, x); }
  }
  let cx = cx0, cy: number, side: number;
  // 3판 살색은 갈색 머리 하이라이트까지 살색으로 잡아 크롭이 머리로 올라갔다(눈이 바닥, 입 잘림). 실루엣으로 돌아가되 조금 아래·조금 좁게(0.40H / 0.62H).
  void n; void st; void sb; void sl; void sr;
  if (false) {
    const skinH = (sb - st + 1) * k;
    cx = ((sl + sr + 1) / 2) * k;
    cy = ((st + sb + 1) / 2) * k - skinH * 0.1;           // 이마·머리 쪽으로 조금
    // 2.1배는 위로 못 올라가서(그림 꼭대기에 걸려) 얼굴이 아래로 밀렸다 — 1.7배: 머리 윗부분은 조금 잘려도 눈·입이 가운데.
    side = Math.round(Math.min(S, Math.max(skinH * 1.7, H * 0.4)));
  } else {
    cy = y0 + H * 0.43; side = Math.round(Math.min(S, H * 0.62));
  }
  /**
   * **칸에 맞춰 자른다** (11-10). 자리를 아무 데나 잡으면 칸이 반씩 걸려 들어오고,
   * 줄이면 칸이 깨진다. 둘 다 안 한다 — 도트 크기의 배수 자리에서 **칸 수만큼** 잘라 그대로 낸다.
   *
   * 도트 크기는 스프라이트 규격에서 온다: 논리 128칸짜리 그림이므로 `S/128`.
   * (512 → 4). 규격이 바뀌면 이 한 줄이 따라간다.
   */
  const texel = Math.max(1, Math.round(S / 128));
  const 자를크기 = Math.min(S, FACE_CELLS * texel);
  const 맞춤 = (v: number) => Math.max(0, Math.min(S - 자를크기, Math.floor(v / texel) * texel));
  const l = 맞춤(cx - 자를크기 / 2);
  void side;
  const 자르기 = (t: number) => sharp(png).extract({ left: l, top: t, width: 자를크기, height: 자를크기 }).png().toBuffer();

  /**
   * **칸 단위로 스스로 내려 맞춘다** (11-10).
   *
   * 틀을 한 크기(72칸)로 고정했더니 도윤처럼 머리가 긴 사람은 얼굴이 81% 자리에 앉았다
   * (기준은 55~80%). 사람마다 손으로 숫자를 적는 대신 **재서 한 칸씩 옮긴다** —
   * 옮기는 단위가 도트 크기라 격자는 그대로다. 못 맞추면 맞춘 척하지 않고 그대로 낸다
   * (부르는 쪽이 재서 거른다).
   */
  let t = 맞춤(cy - 자를크기 / 2);
  let face = await 자르기(t);
  for (let i = 0; i < 10; i++) {
    const c = await faceCropCheck(face);
    if (c.centerY >= 0.6 && c.centerY <= 0.75) break;
    const 다음 = 맞춤(t + (c.centerY > 0.75 ? texel : -texel));
    if (다음 === t) break;                       // 그림 끝에 닿았다
    t = 다음;
    face = await 자르기(t);
  }
  return face;
}

/** 자: 크롭 안에서 살색(얼굴)의 세로 가운데가 35~65% 에 있나, 살색이 크롭의 12% 이상 차지하나. */
export async function faceCropCheck(face: Buffer): Promise<{ ok: boolean; centerY: number; skinRatio: number }> {
  const { data, info } = await sharp(face).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  let n = 0, sy = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * ch;
    if (isSkin(data[p], data[p + 1], data[p + 2], data[p + 3])) { n++; sy += y; }
  }
  const centerY = n ? sy / n / H : 0, skinRatio = n / (W * H);
  return { ok: n > 0 && centerY >= 0.35 && centerY <= 0.65 && skinRatio >= 0.12, centerY, skinRatio };
}
