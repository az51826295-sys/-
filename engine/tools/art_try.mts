/**
 * **캐릭터 한 장 · 전투 도트 한 장** (228회차 10-04, 사장님 "캐릭터 창은 고퀄, 전투는 픽셀랩").
 *   npx tsx engine/tools/art_try.mts [--진짜]
 *
 * 두 자리는 **그림 종류가 다르다**. 캐릭터 창은 보여 주는 자리라 큰 일러스트 한 장,
 * 전투는 여럿이 움직이는 자리라 도트 스프라이트. 한 종류로 둘 다 하려 들면 양쪽 다 어정쩡해진다.
 *
 * 처음에는 **한 장씩만** 뽑는다. 결이 아니면 거기서 갈아엎는 게 65장 뽑고 갈아엎는 것보다 싸다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const 진짜 = process.argv.includes("--진짜");
const 칸 = "C:/Users/az518/Desktop/로키-그림시험";
mkdirSync(칸, { recursive: true });

const 열쇠칸 = `${process.env.LOCALAPPDATA}/rookery-dot`;
const 읽기 = (f: string) => (existsSync(`${열쇠칸}/${f}`) ? JSON.parse(readFileSync(`${열쇠칸}/${f}`, "utf8")) : null);
const GEMINI = 읽기("gemini.json")?.apiKey ?? process.env.GEMINI_API_KEY ?? "";
const PIXELLAB = 읽기("pixellab.json")?.apiKey ?? "";
console.log(`열쇠 — 제미나이 ${GEMINI ? "있음" : "없음"} · 픽셀랩 ${PIXELLAB ? "있음" : "없음"}`);

/**
 * 사장님 10-04: *"아니 십덕 캐릭터야"* — 서양 리얼 유화풍이 아니라 **애니 그림체**다.
 * 모바일 가챠 게임의 캐릭터 카드 그림 쪽. 그리는 결이 바뀌면 같은 설정도 완전히 다른 물건이 된다.
 */
const 캐릭터 = [
  "Anime style game character illustration, Japanese mobile gacha game card art.",
  "Clean cel shading, crisp lineart, vivid saturated colors, large expressive anime eyes, stylized proportions.",
  "A young knight girl, full body, standing, facing the viewer, confident pose.",
  "Silver-white plate armor with blue cloth accents, a kite shield on the left arm, a longsword held down in the right hand.",
  "The whole figure fits inside the frame with small margins — head near the top, boots near the bottom, nothing cropped.",
  "Plain dark slate background, no scenery, no text, no logo, no frame, no border, no watermark.",
  "Vertical composition.",
].join(" ");

const 도트 = "anime style knight girl in silver white plate armor with blue cloth, holding a longsword and a kite shield, facing right, side view for a side-scrolling battle";

if (!진짜) { console.log("\n--진짜 를 붙이면 실제로 뽑는다(돈이 나간다)."); process.exit(0); }

// ── 캐릭터 창용 — 고퀄 한 장 ───────────────────────────────────
if (GEMINI) {
  const t0 = Date.now();
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": GEMINI, "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: 캐릭터 }] }] }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!r.ok) console.log(`캐릭터 거절 ${r.status}: ${(await r.text()).slice(0, 200)}`);
    else {
      const j = await r.json() as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
      const p = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data);
      if (!p) console.log("캐릭터 — 그림이 안 왔다");
      else {
        const buf = Buffer.from(p.inlineData!.data!, "base64");
        const ext = (p.inlineData!.mimeType ?? "image/png").split("/")[1];
        writeFileSync(`${칸}/캐릭터-기사-애니.${ext}`, buf);
        console.log(`캐릭터 → ${칸}/캐릭터-기사-애니.${ext} (${(buf.length / 1024).toFixed(0)}KB · ${((Date.now() - t0) / 1000).toFixed(0)}초)`);
      }
    }
  } catch (e) { console.log(`캐릭터 떨어짐: ${e instanceof Error ? e.message.slice(0, 140) : e}`); }
}

// ── 전투용 — 픽셀랩 도트 ──────────────────────────────────────
// 문 이름을 모른다. 알려진 후보를 차례로 두드려 보고 **무엇이 응답했는지 적는다**.
if (PIXELLAB) {
  const 후보 = [
    { url: "https://api.pixellab.ai/v1/generate-image-pixflux", body: { description: 도트, image_size: { width: 64, height: 64 }, no_background: true } },
    { url: "https://api.pixellab.ai/v1/generate-image-bitforge", body: { description: 도트, image_size: { width: 64, height: 64 }, no_background: true } },
  ];
  for (const c of 후보) {
    const t0 = Date.now();
    try {
      const r = await fetch(c.url, {
        method: "POST",
        headers: { authorization: `Bearer ${PIXELLAB}`, "content-type": "application/json" },
        body: JSON.stringify(c.body),
        signal: AbortSignal.timeout(300_000),
      });
      const 글 = await r.text();
      if (!r.ok) { console.log(`도트 ${c.url.split("/").pop()} 거절 ${r.status}: ${글.slice(0, 200)}`); continue; }
      const j = JSON.parse(글) as { image?: { base64?: string; type?: string }; usage?: unknown };
      const b64 = j.image?.base64;
      if (!b64) { console.log(`도트 ${c.url.split("/").pop()} — 그림이 안 왔다: ${글.slice(0, 160)}`); continue; }
      const buf = Buffer.from(b64, "base64");
      writeFileSync(`${칸}/도트-기사-애니.png`, buf);
      console.log(`도트 → ${칸}/도트-기사-애니.png (${(buf.length / 1024).toFixed(0)}KB · ${((Date.now() - t0) / 1000).toFixed(0)}초) · ${c.url.split("/").pop()}`);
      console.log(`값: ${JSON.stringify(j.usage ?? "안 알려 줌")}`);
      break;
    } catch (e) { console.log(`도트 ${c.url.split("/").pop()} 떨어짐: ${e instanceof Error ? e.message.slice(0, 140) : e}`); }
  }
}
console.log(`\n${칸}`);
