/**
 * **지금 도는 커밋이 뭔가** (227회차 09-29).
 *
 * `deploy_safe.mts` 는 올릴 때마다 이렇게 적는다: *"이 서비스는 자기 커밋을 안 알린다 —
 * **도는지 못 잰다.**"* 오늘 그 구멍에 빠졌다. 하트 확률을 고쳐 올리고 "됐다" 고 적을 뻔했는데,
 * 실제로 올려 보니 **고치기 전 확률 그대로**였다. 자가 침묵하면 옛 코드가 계속 돈다
 * ([[green-deploy-wrong-service]] — 초록인데 옛 코드였다).
 *
 * 그래서 서버가 **자기가 누구인지 말하게** 한다. 한 줄이면 "올렸다" 와 "새 코드가 돈다" 를 가를 수 있다.
 * 비밀은 없다 — 커밋 해시와 뜬 시각뿐이다.
 */
export const dynamic = "force-dynamic";

const 뜬때 = new Date().toISOString();

export function GET() {
  return Response.json({
    commit: (process.env.ROOKERY_COMMIT ?? "").slice(0, 7) || "모름",
    product: process.env.PRODUCT ?? "모름",
    startedAt: 뜬때,
  });
}
