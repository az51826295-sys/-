/** 투구가 끝난 뒤 흉갑이 저절로 나가는지 — 이어달리기의 진짜 확인. */
import { createServiceClient } from "../../src/lib/supabase/service";
const db = createServiceClient();
for (let i = 0; i < 70; i++) {
  const { data } = await db.from("assignments").select("title,status,created_at").order("created_at",{ascending:false}).limit(3);
  const rows = (data ?? []) as Record<string,string>[];
  const top = rows[0];
  if (top && /상체|흉갑/.test(String(top.title))) {
    console.log(`**흉갑이 저절로 나갔다** ${top.created_at.slice(11,19)} [${top.status}] ${String(top.title).slice(0,50)}`);
    process.exit(0);
  }
  if (i % 10 === 0) console.log(`… ${top?.created_at?.slice(11,19)} [${top?.status}] ${String(top?.title).slice(0,30)}`);
  await new Promise((r) => setTimeout(r, 20000));
}
console.log("아직 안 나갔다");
