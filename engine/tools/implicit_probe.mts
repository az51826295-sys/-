/**
 * **행동에서 읽은 판정이 사람의 판정인가** (169회차 09-18).
 *   npx tsx engine/tools/implicit_probe.mts                                   — 읽는 규칙만(지어낸 대화). 돈 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/implicit_probe.mts --live — 운영 대화를 읽는다. 안 읽은 말만 싼 모델로 읽고 붙여 둔다(수십 원).
 *
 * 고장 재현(늘 같이): 침묵을 승인으로 세면 안 된다 · 정규식이 읽은 것은 판정이 아니다 · '시작'(계획 확인)은 새 일이 아니다 ·
 * 물렸는데 그 말로 고치는 일이 시작됐다고 승인으로 세면 안 된다.
 */
const { returnedTurns, implicitFrom, loadImplicit } = await import("../../src/lib/genesis/implicit");

if (!process.argv.includes("--live")) {
  let bad = 0, seen = 0;
  const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
  let t = 0;
  const m = (conv: string, role: string, content: string, attachments: Record<string, unknown> | null = null) => ({ id: `m${++t}`, conversation_id: conv, role, content, attachments, created_at: new Date(Date.UTC(2026, 8, 18, 0, t)).toISOString() });
  const msgs = [
    // A: 결과를 받고 물렸다 — 그 말로 고치는 일이 시작됐다
    m("A", "user", "게임 만들어 줘"), m("A", "assistant", "완료", { returned: { deliverableId: "dA" } }),
    m("A", "user", "아니 오른쪽 눌렀는데 왼쪽으로 가"), m("A", "assistant", "고칠게요", { assignment: { id: "a2" } }),
    // B: 결과를 받고 그 위에 다음 일을 시켰다
    m("B", "user", "분석해 줘"), m("B", "assistant", "완료", { returned: { deliverableId: "dB" } }),
    m("B", "user", "좋네, 이걸로 영상 만들어 줘"), m("B", "assistant", "맡길게요", { assignment: { id: "b2" } }),
    // C: 받고 아무 말 없음
    m("C", "user", "문서 써 줘"), m("C", "assistant", "완료", { returned: { deliverableId: "dC" } }),
    // D: 받고 잡담만
    m("D", "user", "그림 그려 줘"), m("D", "assistant", "완료", { returned: { deliverableId: "dD" } }), m("D", "user", "오늘 몇 시야"), m("D", "assistant", "두 시예요"),
    // E: 버렸다
    m("E", "user", "영상 만들어 줘"), m("E", "assistant", "완료", { returned: { deliverableId: "dE", discarded: true } }),
    // F: 받은 뒤 첫 말이 계획 확인 '시작' (다른 일의 카드에 대한 답)
    m("F", "user", "앱 만들어 줘"), m("F", "assistant", "완료", { returned: { deliverableId: "dF" } }), m("F", "user", "시작"), m("F", "assistant", "네 시작할게요", { assignment: { id: "f2" }, approval: { assignmentId: "f2" } }),
  ];
  const turns = returnedTurns(msgs);
  const idOf = (d: string) => turns.find((x) => x.deliverableId === d)!.next?.id ?? "";
  const ai = (rejected: boolean, accepted = false) => ({ rejected, accepted, why: "", by: "ai" as const, at: "" });
  const R = new Map([[idOf("dA"), ai(true)], [idOf("dB"), ai(false, true)], [idOf("dD"), ai(false)], [idOf("dF"), ai(false)]]);
  const V = new Map(implicitFrom(turns, R).map((v) => [v.deliverableId, v]));
  check("물린 말 → 수정 요청, 이유는 그 말 원문", V.get("dA")?.approved === 0 && V.get("dA")?.how === "rejected_in_words" && V.get("dA")!.evidence.includes("왼쪽"), V.get("dA"));
  check("고장: 물렸는데 그 말로 일이 시작됐다고 승인으로 세지 않는다", V.get("dA")?.approved !== 1);
  check("물리지 않고 그 위에 다음 일 → 승인(암묵)", V.get("dB")?.approved === 1 && V.get("dB")?.how === "built_on", V.get("dB"));
  check("고장: 침묵은 승인이 아니다(모름)", !V.has("dC"));
  check("받고 잡담만 → 모름", !V.has("dD"));
  // 첫 실측이 잡은 구멍: 불만의 말투가 아니어도 "다시 만들자"는 받아들인 게 아니다 — 물리지 않음 + 새 일 시작 ≠ 승인.
  const notAccepted = new Map([[idOf("dB"), ai(false, false)]]);
  check("고장: '물리지 않았다 + 그 말로 일이 시작됐다'만으로는 승인이 아니다", implicitFrom(turns, notAccepted).every((v) => v.deliverableId !== "dB"));
  check("버리기 → 거절", V.get("dE")?.approved === 0 && V.get("dE")?.how === "discarded", V.get("dE"));
  check("고장: '시작'(계획 확인)은 새 일이 아니다 → 모름", !V.has("dF"), V.get("dF"));
  const regexOnly = new Map([[idOf("dA"), { rejected: true, why: "정규식", by: "regex" as const, at: "" }]]);
  check("고장: 정규식이 읽은 것은 판정으로 안 쓴다", implicitFrom(turns, regexOnly).filter((v) => v.how !== "discarded").length === 0);
  console.log(`\n본 줄 ${seen} · 어긋남 ${bad}`);
  process.exit(bad === 0 ? 0 : 1);
}

const { createServiceClient } = await import("../../src/lib/supabase/service");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const db = createServiceClient();
const { data: cos } = await db.from("companies").select("id, name").limit(50);
for (const co of (cos ?? []) as { id: string; name: string | null }[]) {
  const r = await loadImplicit(db, co.id, defaultProviders().ai);
  if (!r.returned) continue;
  const ok = r.verdicts.filter((v) => v.approved === 1).length;
  console.log(`\n━━ ${co.id.slice(0, 8)} · 돌아온 결과 ${r.returned} · 그 뒤 사람 말이 있는 것 ${r.withReply} · 읽은 것 ${r.read} → 판정 ${r.verdicts.length} (승인 ${ok} · 수정 요청/거절 ${r.verdicts.length - ok}) · 모름 ${r.returned - r.verdicts.length}`);
  for (const v of r.verdicts.slice(-12)) console.log(`   ${v.approved ? "승인 " : "물림 "} [${v.how}] ${v.evidence.replace(/\s+/g, " ").slice(0, 90)}`);
}
