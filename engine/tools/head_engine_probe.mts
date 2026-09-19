// 189회차: 머리가 주문마다 엔진·바퀴를 어떻게 고르나 — 실제 사실(사장님 회사)을 대고 셋. 값 ≈ $0.003.
//   npx tsx engine/tools/rookery_env.mts engine/tools/head_engine_probe.mts
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { decide, headFacts } = await import("../../src/lib/genesis/head");
const db = createServiceClient();
const facts = await headFacts(db, "5925c03a-557f-46d7-8589-7388b769df40");
for (const order of ["벽돌깨기 만들기", "고퀄로 FPS 슈팅 게임 만들어 줘. 3D 맵에 적 다섯, 총 두 종류", "터치로 하는 두더지 잡기, 20초 제한, 점수 표시", "로키 15초 광고 영상"]) {
  const d = await decide(defaultProviders().ai, { order, kind: "work", facts });
  console.log(`\n주문: ${order}\n  엔진 ${d.engine} — ${d.engineWhy}\n  바퀴 ${d.effort} · 자리 ${d.placement.place} · ${d.estimate}\n  사장님 줄: ${d.showToPerson}`);
}
