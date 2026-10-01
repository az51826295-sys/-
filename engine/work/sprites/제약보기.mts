const { createServiceClient } = await import("../../../src/lib/supabase/service");
const db = createServiceClient();
const { data, error } = await db.rpc("exec_sql" as never, {} as never).then(() => ({ data: null, error: null }), () => ({ data: null, error: null }));
void data; void error;
const { data: d } = await db.from("deliverables").select("assignment_id, work_execution_id, project_id, deliverable_scope").not("assignment_id", "is", null).limit(3);
console.log("assignment 짜리:", JSON.stringify(d));
const { data: p } = await db.from("deliverables").select("assignment_id, work_execution_id, project_id, deliverable_scope").eq("deliverable_scope", "project").limit(2);
console.log("project 짜리:", JSON.stringify(p));
