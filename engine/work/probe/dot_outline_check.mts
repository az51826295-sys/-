/**
 * 테두리 자를 **열 명 전부**에게 대 본다 — 문턱(0.9)이 제품과 맞나.
 * 심은 고장: 테두리를 벗긴 판(통 백업의 원본)을 같이 재서 **낮게 나오는지** 본다.
 */
import { readFileSync, existsSync } from "node:fs";
const { outlineShare, OUTLINE_MIN } = await import("../../../src/lib/dot/outline");

const 사람 = ["doyun", "haru", "jiwoo", "nabi", "rin", "seoha", "soeun", "taeo", "yeonu", "yuna"];
const 값: [string, number][] = [];
for (const s of 사람) {
  const p = `public/dot-sprites/${s}/neutral.png`;
  if (!existsSync(p)) { console.log(`${s.padEnd(7)} 파일 없음`); continue; }
  /* 새 셋은 도트 2, 옛 일곱은 도트 8 — 자에 그 값을 줘야 한다. */
  const texel = ["jiwoo", "soeun", "taeo"].includes(s) ? 2 : 8;
  const r = await outlineShare(readFileSync(p), texel);
  값.push([s, r.비율]);
  console.log(`${s.padEnd(7)} 도트 ${texel} · 바깥칸 ${String(r.바깥칸).padStart(4)} 중 흰 ${String(r.흰칸).padStart(4)} = ${(r.비율 * 100).toFixed(1)}%${r.비율 < OUTLINE_MIN ? "  ← 문턱 아래" : ""}`);
}
/* 심은 고장 — 테두리 두르기 전 그림(백업 통)을 재 본다. */
const 전 = "C:/Users/az518/Desktop/로키-도트/백업-통-20261109/rin/neutral.png";
if (existsSync(전)) {
  const r = await outlineShare(readFileSync(전), 8);
  console.log(`\n심은 고장 — 테두리 두르기 전 린: ${(r.비율 * 100).toFixed(1)}% → ${r.비율 < OUTLINE_MIN ? "✅ 자가 잡는다" : "❌ 자가 못 잡는다"}`);
}
const 낮은것 = 값.filter(([, v]) => v < OUTLINE_MIN);
console.log(`\n문턱 ${OUTLINE_MIN} · 아래인 사람 ${낮은것.length}/${값.length}${낮은것.length ? ` (${낮은것.map(([s, v]) => `${s} ${(v * 100).toFixed(0)}%`).join(", ")})` : ""}`);
