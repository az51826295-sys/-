/**
 * **두근도트 도트 전부 점검** (226회차 2026-09-28, 사장님 "오 이제 싹다 점검하자"). 값 0.
 *
 *   npx tsx engine/tools/dot_audit_all.mts [--all]
 *
 * 오늘 배운 것을 전부 대 본다. **얼굴과 전신은 다른 자로 잰다** — 얼굴은 꽉 차게 자르는 것이
 * 정상인데 전신 규칙을 대서 48장을 거짓으로 ❌ 찍은 일이 있었다.
 *
 * 전신에 대는 자 다섯:
 *   ① **잘림** — 왼·오른·위 테두리에 불투명 픽셀 (아래는 봐준다, 발이 바닥에 닿는 건 정상)
 *   ② **남은 마젠타** — 배경 키컬러가 남아 있나 (0 이어야)
 *   ③ **크기 일관** — 한 인물 안에서 칸 크기가 같나 (다르면 표정 바꿀 때 튄다)
 *   ④ **발밑 정렬** — 아래 여백이 같나 (다르면 위아래로 튄다)
 *   ⑤ **잉크** — 칸을 얼마나 채우나 (너무 작으면 앱에서 작게 보인다)
 *
 * 얼굴에 대는 자 둘: 남은 마젠타 · 크기 일관. **잘림은 안 잰다**(못 잼).
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const ALL = process.argv.includes("--all");

type 잼 = { 키: string; W: number; H: number; 왼: number; 오른: number; 위: number; 아래여백: number; 마젠타: number; 잉크: number };

async function 재기(키: string, url: string): Promise<잼 | null> {
  try {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, ch = info.channels;
    const 불투명 = (x: number, y: number) => data[(y * W + x) * ch + 3] > 127;
    let 왼 = 0, 오른 = 0, 위 = 0, 마젠타 = 0, 잉크 = 0;
    for (let y = 0; y < H; y++) { if (불투명(0, y)) 왼++; if (불투명(W - 1, y)) 오른++; }
    for (let x = 0; x < W; x++) if (불투명(x, 0)) 위++;
    for (let p = 0; p < data.length; p += ch) {
      if (data[p + 3] < 128) continue;
      잉크++;
      if (data[p] > 170 && data[p + 2] > 120 && data[p + 1] < 110 && (data[p] - data[p + 1]) > 90) 마젠타++;
    }
    let 아래여백 = 0;
    for (let d = 0; d < H; d++) { let 있 = false; for (let x = 0; x < W; x++) if (불투명(x, H - 1 - d)) { 있 = true; break; } if (있) { 아래여백 = d; break; } }
    return { 키, W, H, 왼, 오른, 위, 아래여백, 마젠타: (마젠타 * 100) / (W * H), 잉크: (잉크 * 100) / (W * H) };
  } catch { return null; }
}

const { data: chars, error } = await db.from("dot_characters").select("slug, name, sprites, faces").neq("slug", "test-plumbing").order("slug");
if (error) { console.error("표를 못 읽었다 — 멈춘다:", error.message); process.exit(1); }

let 총문제 = 0;
const 인물잉크: { 이름: string; 잉크: number }[] = [];
for (const c of (chars ?? []) as { slug: string; name: string; sprites: Record<string, string> | null; faces: Record<string, string> | null }[]) {
  const 전신 = Object.entries(c.sprites ?? {});
  const 얼굴 = Object.entries(c.faces ?? {});
  const 전신잼 = (await Promise.all(전신.map(([k, u]) => 재기(k, u)))).filter(Boolean) as 잼[];
  const 얼굴잼 = (await Promise.all(얼굴.map(([k, u]) => 재기(`face:${k}`, u)))).filter(Boolean) as 잼[];

  const 크기들 = new Set(전신잼.map((r) => `${r.W}×${r.H}`));
  const 아래들 = 전신잼.map((r) => r.아래여백);
  const 발밑폭 = 아래들.length ? Math.max(...아래들) - Math.min(...아래들) : 0;
  const 잘림 = 전신잼.filter((r) => r.왼 + r.오른 + r.위 > 0);
  const 마젠타남 = [...전신잼, ...얼굴잼].filter((r) => r.마젠타 > 0.1);
  const 얼굴크기 = new Set(얼굴잼.map((r) => `${r.W}×${r.H}`));
  const 잉크평균 = 전신잼.length ? 전신잼.reduce((s, r) => s + r.잉크, 0) / 전신잼.length : 0;

  const 문제: string[] = [];
  if (크기들.size > 1) 문제.push(`**전신 크기가 제각각** (${[...크기들].join(", ")}) — 표정 바꿀 때 튄다`);
  if (발밑폭 > 8) 문제.push(`**발밑이 안 맞는다** (아래 여백 ${Math.min(...아래들)}~${Math.max(...아래들)}px, 폭 ${발밑폭})`);
  if (잘림.length) 문제.push(`**잘린 전신 ${잘림.length}장** (${잘림.map((r) => r.키).join(", ")})`);
  if (마젠타남.length) 문제.push(`**마젠타가 남았다 ${마젠타남.length}장**`);
  if (얼굴크기.size > 1) 문제.push(`얼굴 크기가 제각각 (${[...얼굴크기].join(", ")})`);
  총문제 += 문제.length;

  console.log(`\n== ${c.name}(${c.slug}) · 전신 ${전신잼.length}장 · 얼굴 ${얼굴잼.length}장`);
  console.log(`   크기 ${[...크기들].join(", ")} · 잉크 평균 ${잉크평균.toFixed(1)}% · 발밑 여백 ${아래들.length ? `${Math.min(...아래들)}~${Math.max(...아래들)}` : "?"}px`);
  if (문제.length) for (const m of 문제) console.log(`   ❌ ${m}`);
  else console.log(`   ✅ 걸린 것 없음`);
  인물잉크.push({ 이름: c.name, 잉크: 잉크평균 });
  if (ALL) for (const r of 전신잼) console.log(`      ${r.키.padEnd(12)} ${r.W}×${r.H} 왼${r.왼} 오른${r.오른} 위${r.위} 아래여백${r.아래여백} 잉크${r.잉크.toFixed(0)}%`);
}

// **인물끼리도 대 본다.** 09-28 첫 판에서 인물 **안**에서만 재고 인물 **끼리**는 안 재서,
// 유나가 다른 인물보다 16% 크게 보이는 것을 놓쳤다. 한 화면에 같이 안 나와도 사장님은
// 캐릭터를 오가며 보므로 크기가 들쭉날쭉하면 티가 난다.
const 잉크표 = 인물잉크.slice().sort((a, b) => b.잉크 - a.잉크);
const 폭 = 잉크표.length ? 잉크표[0].잉크 - 잉크표[잉크표.length - 1].잉크 : 0;
console.log(`\n== 인물끼리 (화면에서 얼마나 크게 보이나)`);
for (const r of 잉크표) console.log(`   ${r.이름.padEnd(6)} 잉크 ${r.잉크.toFixed(1)}%`);
if (폭 > 8) {
  const 배 = Math.sqrt(잉크표[0].잉크 / 잉크표[잉크표.length - 1].잉크);
  console.log(`   ❌ **${잉크표[0].이름}가 ${잉크표[잉크표.length - 1].이름}보다 약 ${((배 - 1) * 100).toFixed(0)}% 크게 보인다** (잉크 차 ${폭.toFixed(1)}%p)`);
  총문제++;
} else {
  console.log(`   ✅ 인물끼리 크기가 비슷하다 (잉크 차 ${폭.toFixed(1)}%p)`);
}

console.log(`\n**걸린 것 ${총문제}가지.** 얼굴의 '잘림' 은 안 쟀다 — 얼굴은 꽉 차게 자르는 것이 정상이다(09-28).`);
