/**
 * **웹도 자기 커밋을 알린다** (226회차 2026-09-27).
 *
 * 09-26 에 "초록인데 옛 코드가 돌던" 사고가 있었고, 그 뒤로 워커는 자기 커밋을 적는다.
 * 그런데 **웹은 안 적었다.** 그래서:
 *   · 아침에 만든 "뒤진 서비스" 경고에 웹이 **아예 안 나왔다** — 없는 줄은 뒤질 수도 없으니
 *     조용한 것이 괜찮은 것으로 읽혔다([[green-deploy-wrong-service]]).
 *   · 오늘 웹을 **네 번** 올렸고 네 번 다 배포 자가 "도는지 못 잰다" 로 끝났다.
 *     결과를 대화에 붙이는 일은 웹이 하므로, 웹이 옛 코드면 사장님이 결과를 못 본다.
 *
 * `register()` 는 서버가 뜰 때 한 번 돈다. 그때 한 줄 적고, 그 뒤 5분마다 다시 적는다 —
 * 배포 자는 "언제 마지막으로 살아 있었나(seen_at)" 와 "무슨 커밋인가" 둘을 같이 보기 때문이다.
 *
 * **이 값은 못 미더운 자다.** 워커와 같은 한계를 물려받는다 — `ROOKERY_COMMIT` 은 `deploy.sh` 가
 * 올리기 **전에** 세우는 환경변수이므로, 변수 변경이 일으킨 재배포가 **옛 코드로 뜨면서 새 커밋을
 * 보고**할 수 있다. 없는 것보다는 낫지만 이것만으로 초록을 믿지 않는다.
 */
export function register() {
  // 엣지 런타임에서는 DB 클라이언트를 못 쓴다. 노드에서만 적는다.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const 적기 = async () => {
    try {
      // 서비스 클라이언트로만 적는다 — 쿠키 클라이언트는 요청 밖에서 못 쓴다
      // ([[db-constraint-errors-must-be-read]] 에서 워커 길에 그것을 쓴 것이 사고였다).
      const { createServiceClient } = await import("@/lib/supabase/service");
      const db = createServiceClient();
      const { error } = await db.from("service_heartbeat").upsert(
        {
          service: process.env.RAILWAY_SERVICE_NAME ?? "rookery-web",
          commit_sha: process.env.ROOKERY_COMMIT ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
          seen_at: new Date().toISOString(),
          deployed_at: process.env.RAILWAY_DEPLOYMENT_CREATED_AT ?? null,
        },
        { onConflict: "service" },
      );
      // 오류를 **읽는다.** 09-18 에 제약 거부를 안 읽어서 좀비 업무가 생겼다.
      if (error) console.warn("[heartbeat] 웹 커밋을 못 적었다:", error.message);
    } catch (e) {
      // 적기가 실패해도 화면은 떠야 한다. 이 줄은 편의이고 제품이 아니다.
      console.warn("[heartbeat] 웹 커밋 적기 실패:", e instanceof Error ? e.message : e);
    }
  };

  // **기다리지 않는다.** next 문서: `register` 가 끝나야 서버가 요청을 받는다.
  // 느린 DB 한 번이 화면을 늦추면 안 된다 — 이 줄은 편의이고 제품이 아니다.
  void 적기();
  // 5분마다. `unref` 로 프로세스를 붙잡지 않게 한다.
  setInterval(적기, 5 * 60 * 1000).unref?.();
}
