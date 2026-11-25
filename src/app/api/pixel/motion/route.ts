import { linkedUserFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { PIXEL_COST, pixelBalance, refundPixelShot, spendPixelShot } from "@/lib/pixel/credits";
import { dataUrl, readUpload } from "@/lib/pixel/serve";
import { MOTIONS, makeMotion, gifOf, sheetOf, type MotionKey } from "@/lib/pixel/motion";

/**
 * AI 동작 생성 — 그림 AI 값이 드니 **미리보기가 없다**(무료로 그리면 우리 돈이 샌다). 장을 먼저 쓰고 그린다.
 * 끝내 같은 캐릭터로 못 그리면(기계 검사 실패·AI 거절) **쓴 장을 돌려준다** — 손님은 실패에 돈을 안 낸다.
 */
export const maxDuration = 180;

export async function POST(request: Request) {
  // 11-25 선결제 + 계정 연결: 손님(익명)은 AI 그림을 못 쓴다
  const who = await linkedUserFrom(request);
  if ("error" in who) return Response.json({ error: who.error, needLogin: true }, { status: who.status });
  const userId = who.id;
  const u = await readUpload(request);
  if ("error" in u) return Response.json({ error: u.error }, { status: u.status });
  if (!(u.motion in MOTIONS)) return Response.json({ error: "동작을 골라 주세요." }, { status: 400 });
  if (u.motion === "custom" && !u.action.trim()) return Response.json({ error: "동작을 글로 적어 주세요." }, { status: 400 });
  const cost = u.motion === "turn" ? PIXEL_COST.turn : PIXEL_COST.motion;
  const db = createServiceClient();
  if ((await pixelBalance(db, userId)) < cost) return Response.json({ error: "토큰이 모자라요.", need: true }, { status: 402 });
  const spent = await spendPixelShot(db, userId, `motion ${u.motion} (그리는 중) ${new Date().toISOString()}`, cost);
  if (!spent) return Response.json({ error: "토큰이 모자라요.", need: true }, { status: 402 });

  const r = await makeMotion(u.buf, u.motion as MotionKey, { colors: u.colors, action: u.action });
  console.log(`[pixel/motion] ${userId.slice(0, 8)} ${u.motion} ok=${r.ok} tries=${r.tries} usd=${r.usd.toFixed(4)} ${r.ok ? r.check.facts.join(" · ") : r.reason}`);
  if (!r.ok) {
    await refundPixelShot(db, userId, spent);
    return Response.json({ error: `같은 캐릭터로 움직임을 못 그렸어요 — 토큰은 돌려드렸어요. (${r.reason.slice(0, 120)})`, refunded: true }, { status: 422 });
  }
  await db.from("dot_purchases").update({ ref: `motion ${u.motion} ${r.set.frames.length}f tries${r.tries} $${r.usd.toFixed(4)} ${new Date().toISOString()}`.slice(0, 120) }).eq("id", spent);
  const scale = Math.max(1, Math.min(8, Math.floor(512 / Math.max(r.set.cellW, r.set.cellH))));
  const [gif, sheet] = await Promise.all([gifOf(r.cuts, r.set, { scale, ms: u.ms }), sheetOf(r.cuts, r.set)]);
  return Response.json({
    ok: true, count: r.set.frames.length, cell: [r.set.cellW, r.set.cellH], check: r.check.facts,
    gif: "data:image/gif;base64," + gif.toString("base64"), sheet: dataUrl(sheet), raw: dataUrl(r.raw), left: await pixelBalance(db, userId),
  });
}
