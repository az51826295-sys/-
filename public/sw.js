/* 서비스 워커(두근도트·로키 공용, 223회차) — 푸시를 받아 알림으로 띄우고, 누르면 그 주소를 연다. 제목·아이콘·주소는 보내는 쪽 몫.
 *
 * 여기엔 캐시·오프라인이 없다. 일부러다: 서비스 워커가 화면을 캐시하면 배포한 뒤에도
 * 옛 화면이 보이고, "고쳤는데 왜 그대로냐" 가 된다. 알림 하나만 한다. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "두근도트", body: "", url: "/dot", tag: "dot", icon: "/dot-icon-192.png" };
  try { data = { ...data, ...event.data.json() }; } catch { /* 몸통이 없으면 기본값 */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.icon,
      tag: data.tag,          // 같은 방 알림은 겹치지 않고 갈아 끼운다
      renotify: true,
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dot";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // 이미 열린 창이 있으면 그 창을 그 방으로 옮긴다. 새 창을 또 열면 앱이 두 개가 된다.
      for (const c of list) {
        if ("navigate" in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    }),
  );
});
