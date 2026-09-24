/**
 * guard_feasible 의 새 판(09-24) — python 패치가 파일에 안 붙어 bash 로 통째로 다시 씀.
 * 갈 길이 있나 → 없으면 하나씩 빼 보고 → 그래도 안 되면 **둘씩** 빼 본다. 낸 사람을 붙인다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/guard_feasible2.mts --proposal <json> [--free-speed] [--origin <html>]
 */
const { openHeadless } = await import("../../src/lib/video/headless");
const { jumpProbeSource } = await import("../../src/lib/skills/appBuild/webMeasures");
const { readFileSync } = await import("node:fs");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
type G = { measure: string; min?: number | null; max?: number | null; why?: string };
const p = JSON.parse(readFileSync(arg("--proposal")!, "utf8")) as { 난간: G[]; 안내값: G[] };
const 자유속도 = process.argv.includes("--free-speed");
const originPath = arg("--origin") ?? "engine/work/candidate-na/index.html";   // 판 9 부터 (나)

const hl = await openHeadless({ width: 1280, height: 720 });
if (!hl) process.exit(1);
try {
  const page = await hl.browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => { const u = r.url(); if (u.startsWith("data:") || u === "about:blank") void r.continue(); else void r.abort(); });
  await page.setContent(readFileSync(originPath, "utf8"), { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 600));
  const up = await page.evaluate(jumpProbeSource(false)) as { ground: number; rec: { y: number }[]; size: { w: number; h: number; speed: number }; plats: { x: number; y: number; w: number }[][] };

  const synth = (rise: number, hang: number, fall: number, peak: number) => { const d: number[] = []; for (let t = 1; t <= rise; t++) d.push(-peak * (1 - Math.pow(1 - t / rise, 2))); for (let t = 0; t < hang; t++) d.push(-peak); for (let t = 1; t <= fall; t++) d.push(-peak * (1 - Math.pow(t / fall, 2))); return d; };
  const 재기 = (rise: number, hang: number, fall: number, peak: number, speed: number) => {
    const dy = synth(rise, hang, fall, peak);
    let 최소 = Infinity, 못 = 0, 오름 = 0;
    for (const st of up.plats) { const ps = [...st].sort((a, b) => a.x - b.x);
      for (let i = 0; i + 1 < ps.length; i++) { const A = ps[i], B = ps[i + 1]; if (B.y > A.y) continue; 오름++;
        const x0 = A.x + A.w - up.size.w, yA = A.y - up.size.h; let ok = false;
        for (let t = 1; t < dy.length && !ok; t++) { const x = x0 + speed * t, y = yA + dy[t], yP = yA + dy[t - 1];
          if (x + up.size.w > B.x && x < B.x + B.w && yP + up.size.h <= B.y && y + up.size.h >= B.y) { ok = true; 최소 = Math.min(최소, (B.x + B.w) - (x + up.size.w)); } }
        if (!ok) 못++; } }
    const m: Record<string, number> = {
      "점프.높이px": peak, "점프.공중프레임": rise + hang + fall, "점프.상승프레임": rise, "점프.꼭대기프레임": hang, "점프.하강프레임": fall,
      "점프.하강나누기상승": Math.round((fall / Math.max(1, rise)) * 100) / 100, "점프.못오르는발판": 못, "점프.오르는발판쌍": 오름,
      // 게임.* 은 이 모형으로는 못 낸다 — 난간에 있으면 '못 잼' 이 아니라 **못 오르는 쌍이 0 이면 깬다** 고 근사한다(둘 다 적어 둔다)
      "게임.클리어": 못 === 0 ? 1 : 0, "게임.닿은무대": 못 === 0 ? 3 : 2, "게임.잃은목숨": 0,
    };
    if (최소 !== Infinity) m["점프.착지여유최소px"] = Math.round(최소 * 10) / 10;
    return m;
  };
  const 맞나 = (m: Record<string, number>, g: G) => { const v = m[g.measure]; if (v == null) return false; if (g.min != null && v < g.min) return false; if (g.max != null && v > g.max) return false; return true; };
  const 길찾기 = (gs: G[]) => {
    const 속도들 = 자유속도 ? [4.8, 4.4, 4.0, 3.8, 3.6, 3.2] : [up.size.speed];
    for (const peak of [100, 110, 120, 130, 140, 150, 160]) for (const rise of [8, 10, 12, 14, 16, 18, 20, 22, 24]) for (const hang of [0, 2, 4, 6, 8, 10, 12, 14, 16]) for (const fall of [8, 10, 12, 14, 16, 18, 20, 22, 24]) for (const sp of 속도들) {
      const m = 재기(rise, hang, fall, peak, sp); if (gs.every((g) => 맞나(m, g))) return { 조합: { peak, rise, hang, fall, speed: sp }, 값: m };
    }
    return null;
  };
  const 낸사람 = (g: G) => p.난간.includes(g) ? "로키(난간)" : "로키(안내값)";
  const 전부 = [...p.난간, ...p.안내값];
  const 답 = 길찾기(전부);
  if (답) {
    console.log("**갈 길이 있다.** 예를 들면:");
    console.log("  상승 " + 답.조합.rise + " · 꼭대기 " + 답.조합.hang + " · 하강 " + 답.조합.fall + " · 높이 " + 답.조합.peak + " · 가로 " + 답.조합.speed);
    console.log("  → " + Object.entries(답.값).map(([k, v]) => k.replace("점프.", "").replace("게임.", "") + "=" + v).join(" · "));
    process.exit(0);
  }
  console.log("**갈 길이 없다.** 어느 조건이 부딪치는지 하나씩 빼 본다:");
  const 하나: string[] = [];
  for (const g of 전부) if (길찾기(전부.filter((x) => x !== g))) 하나.push("  · **" + g.measure + "** (" + 낸사람(g) + ") — 이것만 빼면 길이 생긴다  [" + (g.min ?? "-") + " ~ " + (g.max ?? "-") + "]");
  if (하나.length) { console.log("하나만 풀어도 되는 것:"); console.log(하나.join("\n")); }
  else {
    const 둘: string[] = [];
    for (let i = 0; i < 전부.length; i++) for (let j = i + 1; j < 전부.length; j++) {
      if (길찾기(전부.filter((x) => x !== 전부[i] && x !== 전부[j]))) 둘.push("  · **" + 전부[i].measure + "** (" + 낸사람(전부[i]) + ") + **" + 전부[j].measure + "** (" + 낸사람(전부[j]) + ") — 이 둘을 빼면 길이 생긴다");
    }
    if (둘.length) { console.log("하나만 빼서는 안 풀린다. 둘을 같이 빼면 되는 짝:"); console.log(둘.slice(0, 8).join("\n")); if (둘.length > 8) console.log("  … 짝 " + 둘.length + "개 중 8개만 보임"); }
    else console.log("  둘을 빼도 안 풀린다 — 셋 이상이 얽혀 있다. 안내값을 통째로 다시 내야 한다.");
  }
  if (!자유속도) { console.log("\n**운영자 제약도 조건이다**: 가로 속도 " + up.size.speed + " 고정 (주문서: 점프 물리와 관련된 줄만 손댄다)"); console.log("  `--free-speed` 로 다시 돌려 보면, 이 제약을 푸는 것으로 풀리는지 알 수 있다."); }
  process.exit(1);
} finally { await hl.close(); }
