import { linkedUserFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { PIXEL_COST, pixelBalance, refundPixelShot, spendPixelShot } from "@/lib/pixel/credits";
import { dataUrl, readUpload } from "@/lib/pixel/serve";
import { MOTIONS, makeMotion, gifOf, sheetOf, type MotionKey } from "@/lib/pixel/motion";
import { makeWalk, spriteOf } from "@/lib/pixel/walk";
import { fitTurn } from "@/lib/pixel/fitturn";

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

  // 11-26 걷기: 섞어 6장(다리만 AI, 얼굴·소품은 기본 그림 그대로 · 다리 문) — 1배 투명 도트일 때만, 아니면 옛 길
  if (u.motion === "walk") {
    const sprite = await spriteOf(u.buf).catch(() => null);
    if (sprite) {
      const w = await makeWalk(sprite);
      console.log(`[pixel/motion] ${userId.slice(0, 8)} walk(${w.how}) tries=${w.tries} usd=${w.usd.toFixed(4)} ${w.facts.join(" · ").slice(0, 400)}`);
      const set = { frames: [], cellW: w.cellW, cellH: w.cellH, bg: null, how: "grid" as const };
      await db.from("dot_purchases").update({ ref: `motion walk ${w.how} ${w.frames.length}f tries${w.tries} $${w.usd.toFixed(4)} ${new Date().toISOString()}`.slice(0, 120) }).eq("id", spent);
      const scale = Math.max(1, Math.min(8, Math.floor(512 / Math.max(w.cellW, w.cellH))));
      const [gif, sheet] = await Promise.all([gifOf(w.frames, set, { scale, ms: Math.min(u.ms, 180) }), sheetOf(w.frames, set)]);
      return Response.json({ ok: true, count: w.frames.length, cell: [w.cellW, w.cellH], check: w.facts, gif: "data:image/gif;base64," + gif.toString("base64"), sheet: dataUrl(sheet), raw: dataUrl(sheet), left: await pixelBalance(db, userId) });
    }
  }
  const r = await makeMotion(u.buf, u.motion as MotionKey, { colors: u.colors, action: u.action });
  console.log(`[pixel/motion] ${userId.slice(0, 8)} ${u.motion} ok=${r.ok} tries=${r.tries} usd=${r.usd.toFixed(4)} ${r.ok ? r.check.facts.join(" · ") : r.reason}`);
  if (!r.ok) {
    await refundPixelShot(db, userId, spent);
    return Response.json({ error: `같은 캐릭터로 움직임을 못 그렸어요 — 토큰은 돌려드렸어요. (${r.reason.slice(0, 120)})`, refunded: true }, { status: 422 });
  }
  await db.from("dot_purchases").update({ ref: `motion ${u.motion} ${r.set.frames.length}f tries${r.tries} $${r.usd.toFixed(4)} ${new Date().toISOString()}`.slice(0, 120) }).eq("id", spent);
  // 11-26 4방향 키 맞추기: 그림 AI 가 4방향을 기본 그림보다 8~19% 작게 그린다(10종 중 8종) → 정면 = 기본 그림, 나머지는 기본 키로(1배 투명 도트일 때만)
  if (u.motion === "turn") {
    const sprite = await spriteOf(u.buf).catch(() => null);
    if (sprite) {
      const ft = await fitTurn(sprite, await sheetOf(r.cuts, r.set), r.set.frames.length).catch(() => null);
      if (ft) { r.cuts = ft.frames; r.set = { ...r.set, cellW: ft.cellW, cellH: ft.cellH }; r.check.facts.push(...ft.facts); }
    }
  }
  const scale = Math.max(1, Math.min(8, Math.floor(512 / Math.max(r.set.cellW, r.set.cellH))));
  const [gif, sheet] = await Promise.all([gifOf(r.cuts, r.set, { scale, ms: u.ms }), sheetOf(r.cuts, r.set)]);
  return Response.json({
    ok: true, count: r.set.frames.length, cell: [r.set.cellW, r.set.cellH], check: r.check.facts,
    gif: "data:image/gif;base64," + gif.toString("base64"), sheet: dataUrl(sheet), raw: dataUrl(r.raw), left: await pixelBalance(db, userId),
  });
}
