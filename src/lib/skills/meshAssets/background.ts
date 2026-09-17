import sharp from "sharp";

/**
 * 콘셉트 그림의 **배경이 밝은가** — 모델에게 묻지 않고 픽셀로 잰다.
 *
 * 09-09: 검수(모델)가 자기 필수 조건에 "어두운 배경은 실패" 라고 적어 두고도
 * 새까만 그라데이션 배경을 **첫 판에 통과**시켰다. 아침에도 같은 조건을 세 판 내리 놓쳤다.
 * 이건 의견이 필요한 일이 아니라 **재면 되는 일**이다 — 테두리 픽셀의 밝기 하나로 끝난다.
 *
 * 왜 중요한가: Meshy 는 그림에서 형태를 떼어 낸다. 어두운 배경·후광은 (가) 경계를 흐리고
 * (나) 빛을 텍스처에 구워 게임 조명에서 틀리게 보인다.
 */
export type BackgroundCheck = {
  /** 테두리 평균 밝기 0~1 */
  luma: number;
  /** 밝은 배경인가 */
  ok: boolean;
};

/** 바깥 테두리(가장자리 6%)의 평균 밝기. 물체는 대개 가운데 있으니 테두리가 배경이다. */
export async function checkBackgroundIsLight(
  dataUrlOrBuffer: string | Buffer,
  minLuma = 0.62,
): Promise<BackgroundCheck> {
  const buf =
    typeof dataUrlOrBuffer === "string"
      ? Buffer.from(dataUrlOrBuffer.split(",")[1] ?? "", "base64")
      : dataUrlOrBuffer;

  const img = sharp(buf).ensureAlpha();
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) return { luma: 1, ok: true }; // 못 읽으면 통과 — 여기서 막을 일은 아니다

  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.06));

  let sum = 0;
  let n = 0;
  const add = (x: number, y: number) => {
    const i = (y * w + x) * ch;
    // 사람 눈에 가까운 밝기. 정확한 색 공간까지 갈 일은 아니다.
    sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    n++;
  };
  for (let y = 0; y < h; y++) {
    const edgeRow = y < band || y >= h - band;
    for (let x = 0; x < w; x++) {
      if (edgeRow || x < band || x >= w - band) add(x, y);
    }
  }
  const luma = n ? sum / n : 1;
  return { luma: Math.round(luma * 1000) / 1000, ok: luma >= minLuma };
}
