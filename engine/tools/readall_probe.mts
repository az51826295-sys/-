/** 다 읽었는지 확인하는 자 — 고장을 심어 잡히는지. 모델 0, 돈 0. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { readAll, assertComplete, PAGE } = await import("../../src/lib/db/readAll");
const db = createServiceClient();
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };

const { count } = await db.from("model_usage").select("id", { count: "exact", head: true });
const total = count ?? 0;
const plain = (await db.from("model_usage").select("cost_usd")).data ?? [];
check(`**통째로 읽으면 잘린다**(${total}줄 중 ${plain.length}줄)`, plain.length === PAGE && total > PAGE, { total, got: plain.length });

const all = await readAll<{ cost_usd: unknown }>(db, "model_usage", "cost_usd");
check("**readAll 은 다 읽는다**", all.length === total, { total, got: all.length });
const sum = all.reduce((a, x) => a + Number(x.cost_usd ?? 0), 0);
const cut = plain.reduce((a, x) => a + Number(x.cost_usd ?? 0), 0);
check("**잘린 합보다 크다**(그 차이가 09-22 의 오류였다)", sum > cut, { 전체: sum.toFixed(2), 잘림: cut.toFixed(2) });

// 심은 고장: 1000줄만 받았다고 하면 못 믿는다고 해야 한다
let threw = false;
try { await assertComplete(db, "model_usage", PAGE); } catch { threw = true; }
check("**1000줄 딱 받으면 못 믿는다고 한다**", threw);
let threw2 = false;
try { await assertComplete(db, "model_usage", total); } catch { threw2 = true; }
check("다 받았으면 통과시킨다", !threw2);
let threw3 = false;
try { await assertComplete(db, "deliverables", 5); } catch { threw3 = true; }
check("작은 표를 좁혀 읽은 것은 안 막는다", !threw3);
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
