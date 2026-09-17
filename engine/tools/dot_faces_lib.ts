/** 얼굴 크롭 — dot_faces.mts · dot_new_character.mts · dot_recut.mts 가 같이 쓴다(39회차에 떼어냄). */
import sharp from "sharp";
export const FACE_PX = 96;

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
  const l = Math.round(Math.max(0, Math.min(S - side, cx - side / 2)));
  const t = Math.round(Math.max(0, Math.min(S - side, cy - side / 2)));
  return await sharp(png).extract({ left: l, top: t, width: side, height: side }).resize(FACE_PX, FACE_PX, { kernel: "nearest" }).png().toBuffer();
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
