/**
 * **내가 붙는 쪽이 되어 써 본다** (10-26). 사장님: "니가 써보고 불편한 점 말해줘."
 *   npx tsx engine/work/probe/as-a-user.mts
 *
 * 자를 돌리는 게 아니다. **클로드 코드 입장에서 고리를 실제로 돌려** 어디가 걸리는지 본다:
 *   기준 받기 → 만들기 → 재기 → 어긋난 숫자 보고 고치기 → 다시 재기
 *
 * 그림은 코드로 그린다(모델 0 · 값 0). 붙는 도구가 그림 AI 를 쓰든 코드로 그리든
 * 로키 쪽에서 겪는 불편은 같다.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const 터 = process.env.ROOKERY_URL ?? "https://rookery-web-production.up.railway.app";
const 열쇠 = JSON.parse(
  (await import("node:fs")).readFileSync("C:/Users/az518/Desktop/ai-workforce/.keys/mcp.json", "utf8"),
).MCP_TOKEN as string;

/* ── 손으로 PNG 를 짠다 — 외부 꾸러미 없이 ── */
function png(w: number, h: number, px: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) { const [r, g, b] = px(x, y); raw[o++] = r; raw[o++] = g; raw[o++] = b; }
  }
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
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function mcp(name: string, args: Record<string, unknown>): Promise<string> {
  const r = await fetch(터 + "/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + 열쇠 },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    signal: AbortSignal.timeout(150_000),
  });
  const j = await r.json() as { result?: { content?: { text?: string }[] }; error?: { message?: string } };
  return j.result?.content?.[0]?.text ?? ("[문이 거부함] " + JSON.stringify(j.error ?? j).slice(0, 200));
}

/* ── 세 번 만들어 본다. 붙는 쪽이 할 만한 수를 순서대로 ── */
type 판 = { 이름: string; 그림: (x: number, y: number) => [number, number, number] };
const W = 96, H = 96;

/** 바닥 밝기. 기준에 `target_ground_luma 169` 가 있으니 맞춰 둔다. */
const 바닥 = (y: number): [number, number, number] => (y > H * 0.78 ? [169, 169, 169] : [210, 214, 220]);

const 판들: 판[] = [
  {
    이름: "① 생각 없이 — 회색 실루엣",
    그림: (x, y) => {
      const 몸 = Math.abs(x - W / 2) < 14 && y > 20 && y < H * 0.8;
      return 몸 ? [90, 92, 96] : 바닥(y);
    },
  },
  {
    이름: "② 색을 늘림 (min_colors 16)",
    그림: (x, y) => {
      if (!(Math.abs(x - W / 2) < 16 && y > 18 && y < H * 0.8)) return 바닥(y);
      if (y < 34) return [214, 170, 132];                 // 얼굴
      if (y < 40) return [60, 42, 30];                    // 머리
      if (y < 60) return [x % 7 < 3 ? 70 : 96, 84, 150];  // 갑옷 두 톤
      return [48, 44, 60];                                // 다리
    },
  },
  {
    이름: "③ 명암폭·바닥대비까지 (luma_spread 120 · ground_contrast 60)",
    그림: (x, y) => {
      if (!(Math.abs(x - W / 2) < 16 && y > 18 && y < H * 0.8)) return 바닥(y);
      const 왼 = x < W / 2;
      if (y < 34) return 왼 ? [246, 214, 184] : [196, 150, 116];   // 아주 밝은 칸을 만든다
      if (y < 40) return [28, 20, 14];                             // 아주 어두운 칸
      if (y < 48) return 왼 ? [232, 236, 244] : [150, 158, 176];   // 투구 광
      if (y < 62) return 왼 ? [96, 112, 198] : [38, 44, 96];
      if (y < 72) return [206, 162, 52];                           // 채도 높은 띠
      return 왼 ? [64, 58, 80] : [22, 20, 28];
    },
  },
];

console.log(`붙는 쪽으로 써 본다 — ${터}\n`);

for (const p of 판들) {
  const buf = png(W, H, p.그림);
  writeFileSync(`engine/work/voice/as-a-user-${p.이름.slice(0, 1)}.png`, buf);
  const t0 = Date.now();
  const 글 = await mcp("measure_image", { image_base64: buf.toString("base64") });
  const 걸림 = Date.now() - t0;
  const 판정 = 글.split("\n")[0] ?? "";
  const 까닭 = 글.split("\n").filter((l) => l.startsWith("- ")).join(" / ");
  const 숫자 = (글.match(/"(colors|luma_spread|saturation|ground_contrast|color_spread)":\s*[\d.]+/g) ?? []).join(" · ");
  console.log(`${p.이름}\n  ${판정.replace("## ", "")} · ${걸림}ms`);
  if (까닭) console.log(`  까닭: ${까닭}`);
  if (숫자) console.log(`  잰 값: ${숫자}`);
  console.log("");
}
