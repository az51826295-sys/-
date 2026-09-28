/**
 * **Meshy vs Tripo — 같은 주문으로 나란히 잰다** (226회차 2026-09-28).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/mesh_bakeoff.mts            # 문만 보고 멈춤
 *   npx tsx engine/tools/rookery_env.mts engine/tools/mesh_bakeoff.mts --run [개수]
 *
 * 사장님 09-28: *"전문기능을 더 잘하는 것도 합치면 안돼?"* — 합치는 것 자체는 쉽다.
 * 어려운 것은 **언제 어느 손을 쓸지 고르는 것**이다. 그 규칙은 지어내지 않고 **재서** 만든다.
 *
 * 그날 분석(영상 5편)이 말한 것: Tripo 로우폴리 **8~15초** · Meshy 로우폴리 **1분 44초**.
 * 그건 **영상이 말한 것**이지 우리가 잰 것이 아니다. 같은 주문으로 우리가 직접 잰다.
 *
 * 재는 것: **걸린 시간 · 크레딧(=돈) · 파일이 실제로 받아지나**.
 * 모양 좋고 나쁨은 여기서 판정하지 않는다 — 그건 사람이 보거나 심판자가 볼 일이고,
 * 09-16 에 화면 보는 심판자가 40~45% 만 잡는 것을 쟀다([[vlm-judge-is-not-a-gate]]).
 *
 * **값**: Tripo 텍스처 포함 한 판 $0.35(새 계정 무료 300크레딧 ≈ 4판) · Meshy 30크레딧.
 * 그래서 기본은 **주문 2개**다. 늘리려면 숫자를 붙여라.
 */
const RUN = process.argv.includes("--run");
const 개수 = Number(process.argv.find((a) => /^\d+$/.test(a))) || 2;

const { falKey, falRun } = await import("../../src/lib/providers/fal");
const { MESH3D } = await import("../../src/lib/providers/mesh3dRegistry");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { defaultMeshProvider } = await import("../../src/lib/providers/meshy");

/**
 * **같은 그림을 양쪽에 준다.** 로키의 Meshy 길은 글이 아니라 **그림**에서 만든다(`imageTo3D`) —
 * 글로 견주면 손이 아니라 **말**을 비교한 것이 된다. 처음 짤 때 그 실수를 했고 타입 검사가 잡았다.
 *
 * 그림은 **지난 결과물에서 빌린다** — 새로 그리면 그림값이 들고, 빌리면 0원이다.
 */
const db = createServiceClient();
const { data: 지난 } = await db
  .from("deliverables")
  .select("content_json, created_at")
  .eq("deliverable_type", "mesh_assets")
  .order("created_at", { ascending: false })
  .limit(30);
const 그림들: { 그림: string; 무엇: string }[] = [];
for (const d of (지난 ?? []) as { content_json: Record<string, unknown> | null }[]) {
  const cj = d.content_json ?? {};
  const img = (cj.conceptImage ?? cj.conceptFront) as string | undefined;
  const 무엇 = String((cj.brief as { subject?: string } | undefined)?.subject ?? "").slice(0, 30);
  if (typeof img === "string" && img.startsWith("data:image")) 그림들.push({ 그림: img, 무엇: 무엇 || "(이름 없음)" });
  if (그림들.length >= 개수) break;
}

const 키 = falKey();
console.log(`fal 키: ${키 ? "있다" : "**없다**"} · 빌린 콘셉트 그림 ${그림들.length}장`);
if (!그림들.length) {
  console.log("지난 3D 결과물에서 콘셉트 그림을 못 찾았다 — 그림 없이는 같은 입력으로 못 견준다.");
  process.exit(0);
}
if (!키) {
  console.log(
    "\nTripo 키가 없어서 못 잰다. 사장님이 키를 만들어 `.env.local` 에 `TRIPO_API_KEY=...` 로 넣으면 이 자가 돈다.\n" +
      "(가입·약관·결제는 내가 대신 하지 않는다 — 그건 사장님 손이다. 키만 생기면 나머지는 내가 한다.)",
  );
  process.exit(0);
}
if (!RUN) {
  console.log(`\n--run 을 붙이면 실제로 만든다. 값 어림: Tripo $${(0.35 * 그림들.length).toFixed(2)} + Meshy 크레딧 ${30 * 그림들.length}.`);
  for (const g of 그림들) console.log(`   빌린 그림: ${g.무엇}`);
  process.exit(0);
}

type 판 = { 손: string; 주문: string; 초: number | null; 크레딧: number | null; 받아짐: boolean; 왜?: string };
const 판들: 판[] = [];
const mesh = defaultMeshProvider();

/**
 * **fal 은 `image_url` 에 data URL 을 바로 받는다.** 처음엔 파일을 올려 주소를 받으려 했는데
 * 그 주소가 404 였다(`rest.alpha.fal.ai/storage/upload`). 올리기를 건너뛰면 그 길이 아예 없어진다 —
 * 고칠 것을 줄이는 쪽을 고른다.
 */
const 올리기 = async (dataUrl: string): Promise<string> => dataUrl;

// 재는 손: 등록부에서 **그림을 받는 fal 손**만 고른다. 등록부에 한 줄 더하면 여기도 저절로 는다.
const fal손 = MESH3D.filter((h) => h.문 === "fal" && h.모델 && h.입력.includes("그림"));
console.log(`fal 손 ${fal손.length}개: ${fal손.map((h) => h.이름).join(" · ")}`);

for (const { 그림, 무엇: p } of 그림들) {
  let 주소 = "";
  try { 주소 = await 올리기(그림); } catch (e) { console.log(`그림 올리기 실패: ${e instanceof Error ? e.message : e}`); }
  for (const h of fal손) {
    if (!주소) { 판들.push({ 손: h.id, 주문: p, 초: null, 크레딧: null, 받아짐: false, 왜: "그림을 못 올렸다" }); continue; }
    try {
      const r = await falRun(h.모델!, { image_url: 주소 });
      const o = r.out as Record<string, any>;
      const url = o?.model_mesh?.url ?? o?.model_glb?.url ?? o?.mesh?.url ?? o?.model?.url ?? null;
      let 받아짐 = false;
      if (url) { try { 받아짐 = (await fetch(url, { method: "HEAD" })).ok; } catch { 받아짐 = false; } }
      판들.push({ 손: h.id, 주문: p, 초: r.ms / 1000, 크레딧: null, 받아짐, 왜: url ? undefined : `파일 칸을 못 찾았다: ${Object.keys(o ?? {}).slice(0, 6).join(",")}` });
    } catch (e) {
      판들.push({ 손: h.id, 주문: p, 초: null, 크레딧: null, 받아짐: false, 왜: e instanceof Error ? e.message.slice(0, 90) : String(e) });
    }
  }
  // ── Meshy ──
  const t0 = Date.now();
  try {
    const r = await mesh.imageTo3D(그림, { topology: "triangle" });
    let 받아짐 = false;
    const url = r.glbUrl ?? r.fbxUrl;
    if (url) { try { 받아짐 = (await fetch(url, { method: "HEAD" })).ok; } catch { 받아짐 = false; } }
    판들.push({ 손: `meshy(${r.model})`, 주문: p, 초: (Date.now() - t0) / 1000, 크레딧: r.consumedCredits, 받아짐: 받아짐 || !!r.glbBase64 });
  } catch (e) {
    판들.push({ 손: "meshy", 주문: p, 초: (Date.now() - t0) / 1000, 크레딧: null, 받아짐: false, 왜: e instanceof Error ? e.message.slice(0, 90) : String(e) });
  }
}

console.log("\n손      초     크레딧  파일  주문");
for (const r of 판들) {
  console.log(
    `${r.손.padEnd(16)} ${(r.초 === null ? "—" : r.초.toFixed(1)).padStart(6)} ${(r.크레딧 === null ? "—" : String(r.크레딧)).padStart(6)}  ` +
      `${r.받아짐 ? "받아짐" : "**없음**"}  ${r.주문.slice(0, 26)}${r.왜 ? `  ← ${r.왜}` : ""}`,
  );
}
const 평균 = (손: string) => {
  const xs = 판들.filter((r) => r.손.startsWith(손) && r.초 !== null).map((r) => r.초!);
  return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "—";
};
console.log(`\n평균 초: tripo ${평균("tripo")} · meshy ${평균("meshy")}`);
console.log(
  "\n**이 표로 규칙을 만든다.** 예: '빠른 게 필요하고 로우폴리면 tripo, 리깅·조각이면 meshy'.\n" +
    "규칙은 이 숫자를 보고 사람이 정한다 — 내가 지어내지 않는다. 모양 좋고 나쁨은 여기서 안 잰다.",
);
