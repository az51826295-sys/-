import sharp from "sharp";
import { realDot, type RealDotResult } from "./realdot";

/** 올린 그림을 받아 변환한다 — 미리보기와 받기가 **같은 함수**를 부른다(둘이 다르면 산 것과 본 것이 다르다). */
export const MAX_BYTES = 10 * 1024 * 1024;

export async function readUpload(request: Request): Promise<{ buf: Buffer; period?: number; colors: number } | { error: string; status: number }> {
  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof Blob)) return { error: "그림을 올려 주세요.", status: 400 };
  if (file.size > MAX_BYTES) return { error: "10MB 아래 그림만 받아요.", status: 413 };
  const buf = Buffer.from(await file.arrayBuffer());
  const meta = await sharp(buf).metadata().catch(() => null);
  if (!meta?.width || !meta.height) return { error: "그림 파일이 아니에요(PNG·JPG·WEBP).", status: 400 };
  if (meta.width * meta.height > 4096 * 4096) return { error: "너무 커요 — 4096×4096 아래로.", status: 413 };
  const p = Number(form?.get("period"));
  const c = Number(form?.get("colors"));
  return {
    buf,
    period: Number.isFinite(p) && p >= 2 && p <= 64 ? p : undefined,
    colors: Number.isFinite(c) && c >= 2 && c <= 64 ? Math.round(c) : 32,
  };
}

export async function convert(buf: Buffer, period: number | undefined, colors: number): Promise<RealDotResult> {
  return realDot(buf, { period, colors });
}

/**
 * 미리보기: 크게 보이되 **줄무늬를 덮는다** — 받기 전에 결과는 다 보이게, 그대로 쓰지는 못하게.
 * 글자는 서버에 글꼴이 없을 수 있어 안 쓴다.
 */
export async function previewOf(r: RealDotResult): Promise<Buffer> {
  const [W, H] = r.logical;
  const s = Math.max(1, Math.floor(720 / Math.max(W, H)));
  const w = W * s, h = H * s;
  const big = await sharp(r.small).resize(w, h, { kernel: "nearest" }).png().toBuffer();
  const stripes = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><pattern id="p" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">` +
    `<rect width="10" height="36" fill="#ffffff" fill-opacity="0.42"/></pattern></defs>` +
    `<rect width="100%" height="100%" fill="url(#p)"/></svg>`,
  );
  return sharp(big).composite([{ input: stripes }]).png().toBuffer();
}

export const dataUrl = (b: Buffer) => "data:image/png;base64," + b.toString("base64");
