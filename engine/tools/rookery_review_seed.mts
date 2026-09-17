/**
 * 판정 화면 눈검수용 씨앗 (98회차) — 로키 실서버에 던져 놓을 사용자·회사·결과물·대화 하나와 로그인 링크.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rookery_review_seed.mts            → 링크와 uid·conversationId 를 찍는다
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rookery_review_seed.mts --delete <uid>
 * 매직 링크는 한 번 쓰면 끝. 지우는 것도 잊지 말 것(cascade 로 전부 사라진다).
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const svc = createServiceClient();
const BASE = "https://rookery-web-production.up.railway.app";
if (process.argv[2] === "--delete") { await svc.auth.admin.deleteUser(process.argv[3]); console.log("지움", process.argv[3]); process.exit(0); }

const email = `seed-${Date.now()}@rookery.local`;
const { data: made, error } = await svc.auth.admin.createUser({ email, password: `seed-${Math.random().toString(36).slice(2)}!`, email_confirm: true }); if (error) throw error;
const uid = made.user.id;
const co = (await svc.from("companies").insert({ owner_id: uid, name: "눈검수 회사" }).select("id").single()).data!;
const found = (await svc.from("employees").select("id, name").limit(1).maybeSingle()).data as { id: string; name: string } | null;
const empId = found?.id ?? (await svc.from("employees").insert({ name: "자", role: "tester", description: "눈검수", salary: "0", status: "available" }).select("id").single()).data!.id;
const ce = (await svc.from("company_employees").insert({ company_id: co.id, employee_id: empId }).select("id").single()).data!;
const as = (await svc.from("assignments").insert({ company_id: co.id, company_employee_id: ce.id, title: "경쟁사 3곳 요약", description: "자", status: "submitted" }).select("id").single()).data!;
const dl = (await svc.from("deliverables").insert({ company_id: co.id, assignment_id: as.id, company_employee_id: ce.id, title: "경쟁사 3곳 요약", deliverable_type: "analysis", content_markdown: "# 요약\n\n- A사 …" }).select("id").single()).data!;
const cv = (await svc.from("conversations").insert({ owner_id: uid, title: "눈검수" }).select("id").single()).data!;
await svc.from("conversation_messages").insert({ conversation_id: cv.id, role: "user", content: "경쟁사 3곳 요약해 줘" });
await svc.from("conversation_messages").insert({ conversation_id: cv.id, role: "assistant", content: "**경쟁사 3곳 요약** 이 돌아왔어요.", attachments: { returned: { deliverableId: dl.id, assignmentId: as.id } } });
const { data: link, error: le } = await svc.auth.admin.generateLink({ type: "magiclink", email }); if (le) throw le;
console.log(`uid ${uid}\nconversation ${cv.id}\n${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink`);
