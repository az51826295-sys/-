/**
 * **말 속도 직선이 맞나 — 오차를 본다** (226회차 09-28). 호출 0번.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/speech_fit_look.mts
 *
 * 09-28 에 영상 벽을 57→89초로 밀었는데 **주문(90초)을 못 넘었다**(계획 92 → 실측 89.0).
 * 자가 "계획 8초 장면이 6.3·6.7초로 나왔다" 고 짚었다. 그런데 이 직선은 **지난 장면에서
 * 자동으로 다시 맞춰진다**(`speechRate`) — 그러면 고칠 게 없을 수도 있다.
 * 그래서 먼저 **오차를 본다**: 지금 직선이 이번 장면들을 얼마나 맞히나.
 *
 * 고치기 전에 재는 이유: 오늘 자를 여덟 번 고쳤고, 그중 둘은 **고장이 아닌데 고치려던 것**이었다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { speechRate, speechLine } = await import("../../src/lib/video/speechRate");
const db = createServiceClient();

const { data: co } = await db.from("companies").select("id, name").order("created_at").limit(1).maybeSingle();
const C = co as { id: string; name: string };
const m = await speechRate(db, C.id);
console.log(`회사 ${C.name}`);
console.log(`지금 직선: ${speechLine(m)}\n`);

const { data } = await db
  .from("deliverables")
  .select("created_at, content_json")
  .eq("company_id", C.id).eq("deliverable_type", "video")
  .order("created_at", { ascending: false }).limit(6);

let 전체오차 = 0, 전체칸 = 0, 부호합 = 0;
for (const row of (data ?? []) as any[]) {
  const cj = row.content_json ?? {};
  const scenes = cj.script?.scenes ?? [];
  const durations = cj.durations ?? [];
  const pad = typeof cj.look?.pad === "number" ? cj.look.pad : 0.4;
  if (!scenes.length || !durations.length) continue;
  let 합예측 = 0, 합실측 = 0, 큰오차 = 0;
  for (let i = 0; i < Math.min(scenes.length, durations.length); i++) {
    const c = (scenes[i].narration ?? "").replace(/\s+/g, "").length;
    if (c < 10) continue;
    const 예측 = m.overheadSec + m.secPerChar * c + pad;
    const 실측 = durations[i];
    합예측 += 예측; 합실측 += 실측;
    큰오차 = Math.max(큰오차, Math.abs(예측 - 실측));
    전체오차 += Math.abs(예측 - 실측); 부호합 += 실측 - 예측; 전체칸++;
  }
  if (!합실측) continue;
  const 차 = 합실측 - 합예측;
  console.log(
    `${String(row.created_at).slice(5, 16)} 장면 ${durations.length}개 · 실측 ${합실측.toFixed(1)}s · ` +
      `직선 예측 ${합예측.toFixed(1)}s · 차 ${차 >= 0 ? "+" : ""}${차.toFixed(1)}s (${((차 / 합실측) * 100).toFixed(1)}%) · 한 장면 최대 오차 ${큰오차.toFixed(1)}s`,
  );
}
console.log(
  전체칸
    ? `\n장면 ${전체칸}개 평균 오차 **${(전체오차 / 전체칸).toFixed(2)}초**`
    : "\n잴 수 있는 장면이 없다",
);
// **처음에 여기 적어 둔 읽는 법이 틀렸다.** "평균 오차가 쉼보다 작으면 멀쩡하다" 고 썼는데,
// 09-28 실측이 그걸 뒤집었다: 한 장면 오차는 평균 0.73초(최대 1.5초)로 작은데 15장면 영상에서
// 합이 **+15.0초(16.9%)** 였다. 오차가 **한 방향으로 쏠려 있으면** 장면 수만큼 곱해진다 —
// 3장면에선 1초라 안 보이고 15장면에선 15초가 된다. **치우침은 평균으로 안 보인다.**
const 치우침 = 전체칸 ? 부호합 / 전체칸 : 0;
console.log(
  `장면당 **치우침 ${치우침 >= 0 ? "+" : ""}${치우침.toFixed(2)}초** (부호를 살려 더한 것) — ` +
    `장면 N개면 합은 그 N배가 된다. 15장면이면 ${(치우침 * 15).toFixed(1)}초.`,
);
console.log(
  "\n읽는 법:\n" +
    "- 차가 **음수**면 실측이 예측보다 짧다(주문한 초를 못 채운다), **양수**면 더 길다.\n" +
    "- **평균 오차로 판단하지 마라.** 작아도 한 방향이면 장면 수만큼 곱해진다 — 치우침 줄을 본다.\n" +
    "- 치우침이 0 에 가까우면 직선은 멀쩡하고, 못 채운 원인은 **계획을 세운 쪽**(장면 초를 몇 초로 잡았나)에 있다.",
);

// ── 옛 장면이 직선을 끌고 있나 ──────────────────────────────────────
// 최소제곱은 맞춘 자료 위에서 치우침이 0 에 가깝다. 그런데 **최근 장면들만** 한쪽으로 쏠렸다면
// 옛 장면(다른 목소리·다른 설정)이 직선을 끌고 있다는 뜻이다. 최근 것만으로 다시 맞춰 견줘 본다.
// 09-17 에 "옛 상수 넷이 새 판단을 막았다" 와 같은 모양인지 본다.
const { data: 전부 } = await db
  .from("deliverables")
  .select("created_at, content_json")
  .eq("company_id", C.id).eq("deliverable_type", "video")
  .order("created_at", { ascending: false }).limit(40);

type 점 = { c: number; sec: number };
const 점들: 점[] = [];
for (const row of (전부 ?? []) as any[]) {
  const cj = row.content_json ?? {};
  const scenes = cj.script?.scenes ?? [];
  const durations = cj.durations ?? [];
  const pad = typeof cj.look?.pad === "number" ? cj.look.pad : 0.4;
  for (let i = 0; i < Math.min(scenes.length, durations.length); i++) {
    const c = (scenes[i].narration ?? "").replace(/\s+/g, "").length;
    const sec = durations[i] - pad;
    if (c >= 10 && sec > 0.5) 점들.push({ c, sec });
  }
}
const 맞추기 = (ps: 점[]) => {
  const n = ps.length;
  if (n < 5) return null;
  const mx = ps.reduce((s, p) => s + p.c, 0) / n, my = ps.reduce((s, p) => s + p.sec, 0) / n;
  let sxy = 0, sxx = 0;
  for (const p of ps) { sxy += (p.c - mx) * (p.sec - my); sxx += (p.c - mx) ** 2; }
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = my - b * mx;
  const 치 = ps.reduce((s, p) => s + (p.sec - (a + b * p.c)), 0) / n;
  return { a, b, n, 치 };
};
const 최근30 = 점들.slice(0, 30);
const 전체맞춤 = 맞추기(점들);
const 최근맞춤 = 맞추기(최근30);
console.log(`\n직선을 다시 맞춰 견주기 (점 = 장면):`);
if (전체맞춤) console.log(`  전체 ${전체맞춤.n}장면:  여백 ${전체맞춤.a.toFixed(2)}s + 글자당 ${전체맞춤.b.toFixed(3)}s`);
if (최근맞춤) console.log(`  최근 ${최근맞춤.n}장면:  여백 ${최근맞춤.a.toFixed(2)}s + 글자당 ${최근맞춤.b.toFixed(3)}s`);
if (전체맞춤 && 최근맞춤) {
  // 최근 30장면을 **전체 직선**으로 맞혔을 때의 치우침 vs **최근 직선**으로 맞혔을 때
  const 치전체 = 최근30.reduce((s, p) => s + (p.sec - (전체맞춤.a + 전체맞춤.b * p.c)), 0) / 최근30.length;
  console.log(`  최근 ${최근30.length}장면에 대한 치우침: 전체 직선 ${치전체 >= 0 ? "+" : ""}${치전체.toFixed(2)}s/장면 · 최근 직선 ${최근맞춤.치 >= 0 ? "+" : ""}${최근맞춤.치.toFixed(2)}s/장면`);
  console.log(
    Math.abs(치전체) > Math.abs(최근맞춤.치) + 0.1
      ? `  → **옛 장면이 직선을 끌고 있다.** 최근 것만으로 맞추면 치우침이 줄어든다(장면 15개면 ${((치전체 - 최근맞춤.치) * 15).toFixed(1)}초 차이).`
      : `  → 옛 장면 탓이 아니다. 치우침은 다른 데서 온다(목소리 설정·쉼·TTS 자체).`,
  );
}
