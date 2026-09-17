/**
 * 브라우저 쪽 푸시 — 서비스 워커를 올리고, 허락을 받고, 구독 주소를 서버에 준다.
 *
 * 왜 자동으로 안 묻는가: 들어오자마자 "알림을 허용하시겠습니까" 가 뜨면 사람은 거의
 * 다 거절하고, 한 번 거절한 브라우저는 다시 못 묻는다. 그래서 **단추를 누를 때만** 묻는다.
 * 첫 대화가 오간 뒤에 단추가 보이게 하는 것은 화면 쪽 몫이다.
 */

export type PushState = "unsupported" | "off" | "on" | "denied";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

function b64ToBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** 알림 켜기. 허락을 못 받으면 그 상태를 그대로 돌려준다 — 화면이 그에 맞게 말한다. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const { publicKey, enabled } = (await (await fetch("/api/dot/push")).json()) as { publicKey: string; enabled: boolean };
  if (!enabled) return "unsupported";

  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) as BufferSource }));

  const res = await fetch("/api/dot/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return res.ok ? "on" : "off";
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch(`/api/dot/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
    await sub.unsubscribe();
  }
  return "off";
}
