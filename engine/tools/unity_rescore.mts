/**
 * 지난 유니티 검사를 **오늘 고친 자로 다시 읽는다** (123회차 09-15). 돈 0, 유니티 0, 아무것도 쓰지 않는다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/unity_rescore.mts
 *
 * 119·121·122회차에 자를 세 군데 고쳤다. 그러면 **지난 실패 중 몇 건이 진짜였나**가 바뀐다 —
 * 그 숫자가 중요한 이유: `cases.ts` 가 이 실패들을 규칙 고리의 학습 재료로 쓴다. 가짜 실패로 배우면 가짜 규칙이 나온다.
 *
 * 정직하게 읽는 법: 통과율이 올라간 것은 **잘해진 게 아니라 잘못 세던 걸 바로잡은 것**이다.
 * 그래서 '진짜 실패' 와 '자가 만든 실패' 를 갈라 센다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");

const db = createServiceClient();
const { data: msgs } = await db
  .from("conversation_messages")
  .select("content, created_at")
  .not("attachments->unityChecks", "is", null)
  .order("created_at", { ascending: true });

type Line = { name: string; res: "통과" | "떨어짐" | "못잼"; msg: string };
const EXC = /Unhandled log message:\s*'?\[(?:Exception|Error)\]\s*([^']{10,160}?)\s*(?:\.|')/;

let runs = 0;
const before = { pass: 0, fail: 0, inc: 0 };
const after = { pass: 0, fail: 0, inc: 0 };
const reclassified: Record<string, number> = {};

for (const m of ((msgs ?? []) as { content: string; created_at: string }[])) {
  const lines: Line[] = [];
  for (const raw of m.content.split("\n")) {
    const t = raw.trim();
    if (!/^- [✅❌◻︎]/.test(t)) continue;
    const res = t.startsWith("- ✅") ? "통과" : t.startsWith("- ❌") ? "떨어짐" : "못잼";
    const rest = t.replace(/^- [✅❌◻︎]\s*/, "");
    const name = rest.split("—")[0].trim();
    lines.push({ name, res, msg: rest });
  }
  if (!lines.length) continue;
  runs++;
  for (const l of lines) before[l.res === "통과" ? "pass" : l.res === "떨어짐" ? "fail" : "inc"]++;

  // ── 122회차: 같은 예외가 여러 줄을 덮었으면 첫 줄만 실패
  const roots = new Map<string, number>();
  for (const l of lines) { if (l.res !== "떨어짐") continue; const r = l.msg.match(EXC)?.[1]; if (r) roots.set(r, (roots.get(r) ?? 0) + 1); }
  const shared = new Set([...roots.entries()].filter(([, n]) => n > 1).map(([r]) => r));
  const kept = new Set<string>();

  for (const l of lines) {
    let res = l.res;
    if (res === "떨어짐") {
      const r = l.msg.match(EXC)?.[1];
      if (r && shared.has(r)) {
        if (kept.has(r)) { res = "못잼"; reclassified["예외가 덮은 줄(122)"] = (reclassified["예외가 덮은 줄(122)"] ?? 0) + 1; }
        else kept.add(r);
      } else if (/기대 ([\d.]+)~\1(?:$|\s|,)/.test(l.msg) || /기대 6\.3~6\.3/.test(l.msg)) {
        // ── 119회차: 폭 0인 기대치는 못 잰다
        res = "못잼"; reclassified["폭 0인 기대치(119)"] = (reclassified["폭 0인 기대치(119)"] ?? 0) + 1;
      } else if (l.name === "규격_조각_자리") {
        // ── 121회차: 문턱을 0.42±0.15 로 고쳤다
        const off = Number(l.msg.match(/([\d.]+)배/)?.[1]);
        if (Number.isFinite(off) && Math.abs(off - 0.42) <= 0.15) { res = "통과"; reclassified["조각 자리 문턱(121)"] = (reclassified["조각 자리 문턱(121)"] ?? 0) + 1; }
      }
    } else if (l.res === "통과" && l.name === "규격_조각_자리") {
      const off = Number(l.msg.match(/([\d.]+)배/)?.[1]);
      if (Number.isFinite(off) && Math.abs(off - 0.42) > 0.15) { res = "떨어짐"; reclassified["조각 자리 — 이제 떨어짐(121)"] = (reclassified["조각 자리 — 이제 떨어짐(121)"] ?? 0) + 1; }
    }
    after[res === "통과" ? "pass" : res === "떨어짐" ? "fail" : "inc"]++;
  }
}

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : "—");
const bTot = before.pass + before.fail + before.inc, aTot = after.pass + after.fail + after.inc;
console.log(`검사 턴 ${runs} · 검사 줄 ${bTot}\n`);
console.log("            통과    떨어짐   못 잼");
console.log(`오늘 전   ${String(before.pass).padStart(5)}  ${String(before.fail).padStart(6)}  ${String(before.inc).padStart(5)}   (통과율 ${pct(before.pass, bTot)})`);
console.log(`오늘 후   ${String(after.pass).padStart(5)}  ${String(after.fail).padStart(6)}  ${String(after.inc).padStart(5)}   (통과율 ${pct(after.pass, aTot)})`);
console.log("\n무엇이 바뀌었나:");
for (const [k, v] of Object.entries(reclassified).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}건  ${k}`);
const artifacts = (reclassified["예외가 덮은 줄(122)"] ?? 0) + (reclassified["폭 0인 기대치(119)"] ?? 0) + (reclassified["조각 자리 문턱(121)"] ?? 0);
console.log(`\n지난 '떨어짐' ${before.fail}건 중 **자가 만든 것 ${artifacts}건**(${pct(artifacts, before.fail)}) · 진짜 실패 ${before.fail - artifacts}건`);
console.log("주의: 통과율이 오른 것은 잘해진 게 아니라 잘못 세던 걸 바로잡은 것이다. 새로 떨어지게 된 줄도 위에 같이 적혀 있다.");
