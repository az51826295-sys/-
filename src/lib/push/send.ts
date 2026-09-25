import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * **로키가 폰으로 말 건다** (223회차 09-25, 사장님 "편하게 자동으로 하고 알람 받고 싶은데").
 *
 * 두근도트의 푸시 부품(web-push + VAPID)을 로키에 옮겨 붙였다. 구독 표는 로키 프로젝트에 남아 있던 `dot_push_subs` 를
 * 그대로 쓴다(09-11 두근도트가 자기 프로젝트로 떠난 뒤 빈 채로 남아 있었다 — 새 표를 만들 DDL 통로가 지금 손에 없어서).
 * 보내는 곳 셋: 일이 대화에 붙을 때(workReturns) · 매일 배치 끝(notify.mts) · 자가 고침 커밋(notify.mts).
 * 죽은 주소(404/410)는 지우지 않고 dead_at 만 찍는다 — 왜 안 오는지 볼 수 있게.
 */
type Db = SupabaseClient<any, any, any>;
export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
let ready = false;
function setup() {
  if (ready) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hello@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
}

/** 한 사람의 산 기기 전부에 보낸다. 돌려주는 값: 보낸 수 / 죽은 수. 구독이 없으면 0/0 — 조용히. */
export async function pushToUser(db: Db, userId: string, p: PushPayload): Promise<{ sent: number; dead: number }> {
  if (!pushConfigured()) return { sent: 0, dead: 0 };
  setup();
  const { data: subs } = await db.from("dot_push_subs").select("endpoint, p256dh, auth").eq("user_id", userId).is("dead_at", null);
  let sent = 0, dead = 0;
  for (const s of (subs ?? []) as { endpoint: string; p256dh: string; auth: string }[]) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ tag: "rookery", url: "/ask", icon: "/rookery-icon-192.png", ...p }), { TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode ?? 0;
      if (code === 404 || code === 410) { dead++; await db.from("dot_push_subs").update({ dead_at: new Date().toISOString() }).eq("endpoint", s.endpoint); }
      else console.warn("[push] 못 보냄", code, e instanceof Error ? e.message.slice(0, 120) : e);
    }
  }
  return { sent, dead };
}

/** 회사 주인에게. 회사 id 만 아는 자리(워커)에서 쓴다. */
export async function pushToCompanyOwner(db: Db, companyId: string, p: PushPayload) {
  const { data: co } = await db.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  if (!co?.owner_id) return { sent: 0, dead: 0 };
  return pushToUser(db, co.owner_id as string, p);
}
