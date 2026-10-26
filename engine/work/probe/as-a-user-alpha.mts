/**
 * **똑같은 상수가 자 탓인가 내 탓인가** (10-26).
 *   npx tsx engine/work/probe/as-a-user-alpha.mts
 *
 * 앞 판 세 개에서 채도 10.0 · 바닥 대비 44.5 가 **글자 그대로 똑같이** 나왔다.
 * 금색·파란색을 넣은 판에서도 그랬다. 자 탓으로 보이지만
 * **심은 것을 먼저 의심한다**([[planted-fault-must-be-well-formed]]) —
 * 아마 캐릭터를 배경에서 가르려고 **투명도**를 보는데 내 PNG 에 알파가 없었다.
 *
 * 그래서 같은 그림을 **알파 있는 PNG(색종류 6)** 로 다시 낸다. 숫자가 움직이면 내 탓,
 * 안 움직이면 자가 그 둘을 안 재고 있다는 뜻이다.
 */
import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const 터 = process.env.ROOKERY_URL ?? "https://rookery-web-production.up.railway.app";
const 열쇠 = JSON.parse(readFileSync("C:/Users/az518/Desktop/ai-workforce/.keys/mcp.json", "utf8")).MCP_TOKEN as string;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

/** 알파 있는 PNG. 색종류 6 = RGBA. */
function pngRGBA(w: number, h: number, px: (x: number, y: number) => [number, number, number, number]): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) { const [r, g, b, a] = px(x, y); raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a; }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const W = 96, H = 96;
/** 앞 ③판과 **같은 몸**, 배경만 투명. 바뀐 변수가 하나여야 원인을 짚을 수 있다. */
const 몸 = (x: number, y: number): [number, number, number, number] => {
  if (!(Math.abs(x - W / 2) < 16 && y > 18 && y < H * 0.8)) return [0, 0, 0, 0];
  const 왼 = x < W / 2;
  if (y < 34) return 왼 ? [246, 214, 184, 255] : [196, 150, 116, 255];
  if (y < 40) return [28, 20, 14, 255];
  if (y < 48) return 왼 ? [232, 236, 244, 255] : [150, 158, 176, 255];
  if (y < 62) return 왼 ? [96, 112, 198, 255] : [38, 44, 96, 255];
  if (y < 72) return [206, 162, 52, 255];
  return 왼 ? [64, 58, 80, 255] : [22, 20, 28, 255];
};

async function 재기(buf: Buffer): Promise<string> {
  const r = await fetch(터 + "/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + 열쇠 },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      params: { name: "measure_image", arguments: { image_base64: buf.toString("base64") } },
      method: "tools/call",
    }),
    signal: AbortSignal.timeout(150_000),
  });
  const j = await r.json() as { result?: { content?: { text?: string }[] } };
  return j.result?.content?.[0]?.text ?? JSON.stringify(j).slice(0, 200);
}

const buf = pngRGBA(W, H, 몸);
writeFileSync("engine/work/voice/as-a-user-alpha.png", buf);
console.log(`알파 있는 PNG (${Math.round(buf.length / 1024)}KB) 로 같은 몸을 다시 낸다\n`);
const 글 = await 재기(buf);
console.log(글);
console.log("\n앞 판(알파 없음) 값: colors 12 · saturation 10.0 · ground_contrast 44.5");
console.log("채도·바닥대비가 움직였으면 **내 탓**(알파를 안 냈다), 안 움직였으면 **자가 안 재고 있다.**");
