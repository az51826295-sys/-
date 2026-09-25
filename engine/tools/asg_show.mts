const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: a } = await db.from("assignments").select("*").eq("id", process.argv[2]).maybeSingle();
const r = (a ?? {}) as Record<string, any>;
console.log("제목:", r.title);
console.log("설명 길이:", String(r.description ?? "").length, "· unity/유니티 등장:", /unity|유니티/i.test(String(r.description ?? "")), "· html/웹/브라우저 등장:", /html|웹|브라우저/i.test(String(r.description ?? "")));
console.log("기대 결과:", String(r.expected_outcome ?? "").slice(0, 200));
for (const k of ["role_input", "metadata", "input_json", "role_input_json"]) if (r[k]) console.log(k + ":", JSON.stringify(r[k]).slice(0, 300));
const m = String(r.description ?? "").match(/.{0,60}(unity|유니티).{0,60}/i); if (m) console.log("문맥:", m[0]);
