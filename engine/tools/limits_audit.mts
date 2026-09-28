/**
 * **한계표의 라벨이 칸과 맞나** — 값 0으로 대조한다 (226회차 09-28).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/limits_audit.mts
 *
 * 09-28 에 표가 거짓 숫자 둘을 말하고 있었다:
 *   · 3D "조각 최대 2" → `clips` 는 **애니메이션 동작 클립**이었다
 *   · 분석 "출처 최대 4" → 넷 중 셋이 **0자**였다(준 개수를 셈)
 * 둘 다 **라벨과 칸이 어긋난 것**이다. 그래서 나머지도 같은 자로 훑는다 —
 * 라벨 옆에 **실제 값 몇 개**를 같이 찍어 사람이 눈으로 "이게 그 뜻인가" 를 본다.
 * 기계는 이것을 스스로 판정할 수 없다(뜻은 사람이 안다). 그래서 **표시만 한다.**
 */
import { createServiceClient } from "../../src/lib/supabase/service";
const db = createServiceClient();
const { 크기 } = await import("../../src/lib/chat/limits");

for (const [종류, 재기] of Object.entries(크기)) {
  const { data, error } = await db
    .from("deliverables")
    .select("content_json")
    .eq("deliverable_type", 종류)
    .order("created_at", { ascending: false })
    .limit(6);
  if (error) { console.error(`${종류}: 못 읽었다 — ${error.message}`); continue; }
  const rows = (data ?? []) as { content_json: Record<string, unknown> | null }[];
  console.log(`\n== ${종류} (${rows.length}판 봄)`);
  if (!rows.length) { console.log("   판이 없다 — 이 종류는 못 잰다"); continue; }
  for (const m of 재기) {
    const 값들 = rows.map((r) => m.값(r.content_json ?? {}));
    const 읽힌것 = 값들.filter((v) => v !== null);
    console.log(
      `   ${m.이름.padEnd(10)} ${읽힌것.length}/${rows.length}판에서 읽힘 · 값 ${값들.map((v) => (v === null ? "—" : String(v))).join(", ")}`,
    );
  }
}
console.log(
  "\n읽는 법: **값이 라벨의 뜻과 맞나**를 사람이 본다. 09-28 의 두 거짓은 이렇게 보였을 것이다 —\n" +
    "  3D '조각' 이 0,0,1,1,0 … → 조각이 0인 3D 는 없다(그건 동작 클립이었다)\n" +
    "  '출처' 가 4 인데 인용이 다 한 영상에서만 나왔다 → 준 개수를 센 것이다\n" +
    "한 판도 못 읽는 칸(전부 —)은 **없는 것이 아니라 아직 안 쌓인 것**일 수 있다. 코드에 언제부터 남는지 적어 둔다.",
);
