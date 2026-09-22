const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("company_employees").select("id, employment_status, onboarding_status, work_status, current_assignment_id").eq("id","b52d580e-1938-4a0d-817c-f60f5f00e743").maybeSingle();
console.log(JSON.stringify(data));
const { data: emp } = await db.from("employees").select("id, name, role").eq("id","c3c05766-efd1-4feb-a8fb-1d164c579681").maybeSingle();
console.log(JSON.stringify(emp));
