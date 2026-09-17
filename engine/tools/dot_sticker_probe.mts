/**
 * 스티커 자 (89회차 09-12) — 카톡 이모티콘처럼 캐릭터가 가끔 표정 스티커를 보낸다.
 *   15턴: (1) 스티커 1~5개  (2) 연달아 두 번 없음(사이 ≥4턴)  (3) 스티커 표정 = 그 턴 표정  (4) 무표정 스티커 0
 * 시험 계정(끝에 지움), 숨은 인물 test-plumbing, 모델 15턴.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
process.env.AI_PROVIDER = "deepseek";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { streamDotTurn } = await import("../../src/lib/dot/turn");
const db = createServiceClient();
const { data: made, error } = await db.auth.admin.createUser({ email: `sticker-${Date.now()}@dugeun.local`, password: "sticker-pass-0912!", email_confirm: true }); if (error) throw error;
const uid = made.user.id;
const lines: [boolean, string][] = [];
try {
  const { data: ch } = await db.from("dot_characters").select("id").eq("slug", "test-plumbing").maybeSingle();
  const cid = ch!.id as string;
  const SAYS = ["안녕! 나 지호야", "오늘 시험 망했어 ㅠ", "근데 저녁에 치킨 먹을 거야", "너는 치킨 좋아해?", "깜짝이야 방금 천둥 쳤어", "무서워", "농담이야 ㅋㅋ", "내일 소풍 가", "같이 갈래?", "에이 아쉽다", "그럼 사진 보내줄게", "고마워", "졸려", "잘 자", "내일 봐"];
  const out: { emotion: string; sticker: string | null }[] = [];
  for (const s of SAYS) { let t = ""; const r = await streamDotTurn(db, uid, cid, s, (c) => { t += c; }); if (!r.ok) throw new Error(JSON.stringify(r)); out.push({ emotion: r.emotion, sticker: (r as { sticker?: string | null }).sticker ?? null }); }
  const idx = out.map((o, i) => (o.sticker ? i : -1)).filter((i) => i >= 0);
  const gaps = idx.slice(1).map((v, i) => v - idx[i]);
  lines.push([idx.length >= 1 && idx.length <= 5, `스티커 ${idx.length}개 (1~5) — 턴 ${idx.map((i) => i + 1).join(",")}`]);
  lines.push([gaps.every((g) => g >= 4), `사이 ${gaps.join(",") || "-"} (≥4)`]);
  lines.push([idx.every((i) => out[i].sticker === out[i].emotion), `스티커 표정 = 턴 표정 ${idx.map((i) => `${out[i].sticker}/${out[i].emotion}`).join(" ")}`]);
  lines.push([idx.every((i) => out[i].sticker !== "neutral"), `무표정 스티커 ${idx.filter((i) => out[i].sticker === "neutral").length}개 (0)`]);
  const { count } = await db.from("dot_messages").select("id", { count: "exact", head: true }).eq("user_id", uid).not("sticker", "is", null);
  lines.push([count === idx.length, `표에 저장된 스티커 줄 ${count} (= ${idx.length})`]);
} finally { await db.auth.admin.deleteUser(uid).catch(() => {}); }
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
