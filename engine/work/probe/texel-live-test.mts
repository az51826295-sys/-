/**
 * **도트 크기 자가 운영에서 도나** (10-28). 모델 0 · 값 0.
 *   npx tsx engine/work/probe/texel-live-test.mts [주소]
 *
 * 왜 또 산다: `railway up` 의 "Deploy complete" 는 증거가 아니다. 그 판에 **새로
 * 생긴 칸**을 응답에서 찾아야 올라간 것이다([[railway-deploy-paths]]).
 * 그리고 이번엔 붙는 쪽이 보는 **글까지** 본다 — 숫자가 없으면 못 고친다.
 *
 * 재는 것: 깨끗한 도트가 통과하나 · 뭉갠 것이 떨어지나 · 섞인 세트가 떨어지나 ·
 *          원본 해상도가 **실패가 아니라 못 잼**이 되나 · 글에 숫자·세는 법이 있나.
 * 못 재는 것: 사람이 보기에 예쁜가. 안 본다.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const 터 = process.argv[2] ?? "https://rookery-web-production.up.railway.app";
const 길 = 터 + "/api/mcp";
const 열쇠 = (JSON.parse(readFileSync(".keys/mcp.json", "utf8")) as { MCP_TOKEN: string }).MCP_TOKEN;

let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => {
  if (!ok) 나쁨++;
  console.log((ok ? "통과" : "실패") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본)));
};

/* 그림은 **정답을 아는 것**만 쓴다. 파이썬으로 짓는다 — 자가 쓰는 PIL 과 같은 손이다. */
const 짓기 = `
import base64, io, json
from PIL import Image, ImageFilter
n = 24
art = Image.new("RGBA", (n, n), (0, 0, 0, 0))
px = art.load()
# 색 18개. 5색으로 재니 colors 5 < 16 이 먼저 떨어져서 도트 칸이 통과했는지
# 어긋났는지 글만 보고 가릴 수가 없었다 — 다른 축이 떨어지는 그림으로는 이 축을 못 잰다.
pal = [(40,30,60,255),(120,60,90,255),(220,180,120,255),(70,110,140,255),(240,240,230,255),
       (200,70,70,255),(90,160,90,255),(160,140,200,255),(250,210,80,255),(30,90,110,255),
       (180,100,140,255),(110,110,60,255),(60,60,150,255),(230,140,60,255),(140,200,210,255),
       (85,40,40,255),(205,205,160,255),(20,20,35,255)]
for y in range(n):
    for x in range(n):
        if (x-n/2)**2 + (y-n/2)**2 > (n/2-1)**2: continue
        px[x,y] = pal[(x//3 + y*7//4) % len(pal)]
def b64(im):
    b = io.BytesIO(); im.save(b, "PNG"); return base64.b64encode(b.getvalue()).decode()
print(json.dumps({
  "clean16": b64(art.resize((384,384), Image.NEAREST)),
  "clean12": b64(art.resize((288,288), Image.NEAREST)),
  "blurred": b64(art.resize((384,384), Image.NEAREST).filter(ImageFilter.GaussianBlur(1.2))),
  "noninteger": b64(art.resize((372,372), Image.NEAREST)),
  "native": b64(art),
}))
`;
const 그림 = JSON.parse(execFileSync("python", ["-c", 짓기], {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: "utf-8" },
})) as Record<string, string>;

async function 부르기(name: string, args: Record<string, unknown>): Promise<string> {
  const r = await fetch(길, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + 열쇠 },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    signal: AbortSignal.timeout(180_000),
  });
  const b = await r.json() as { result?: { content?: { text?: string }[] }; error?: { message?: string } };
  if (b.error) return "오류: " + b.error.message;
  return b.result?.content?.[0]?.text ?? "";
}

/* ── ① 새 도구가 목록에 있나 (= 이 판이 진짜 올라갔나) ── */
const 목록 = await (async () => {
  const r = await fetch(길, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + 열쇠 },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    signal: AbortSignal.timeout(60_000),
  });
  return await r.json() as { result?: { tools?: { name: string; inputSchema?: { properties?: Record<string, unknown> } }[] } };
})();
const 도구 = 목록.result?.tools ?? [];
재기("measure_set 이 목록에 있다", 도구.some((t) => t.name === "measure_set"), 도구.map((t) => t.name));
재기("measure_image 에 want_texel 칸이 열렸다",
  Boolean(도구.find((t) => t.name === "measure_image")?.inputSchema?.properties?.want_texel));

/* ── ② 기준에 도트가 들어갔나, 세는 법까지 ── */
const 기준 = await 부르기("get_standard", {});
재기("기준에 도트 문턱이 있다", 기준.includes("min_purity") && 기준.includes("min_trace"));
재기("기준이 도트를 어떻게 만들라고 말한다", 기준.includes("최근접"));

/* 전체 판정이 아니라 **도트 줄만** 본다. 10-28 에 첫 판은 이걸 안 해서 네 칸이
   헛통과했다 — `colors` 가 떨어뜨린 것을 내 자가 잡은 줄로 읽고 있었다
   ([[measure-the-thing-not-a-proxy]]). */
const 도트줄 = (t: string) => t.split("\n").filter((l) =>
  /도트|격자|순도|믹스드/.test(l) && l.trim().startsWith("-")).join(" / ");

/* ── ③ 깨끗한 도트: 도트 칸으로 떨어지지 않는다 ── */
const 깨끗 = await 부르기("measure_image", { image_base64: 그림.clean16, want_texel: 16 });
const 깨끗도트 = 도트줄(깨끗);
재기("깨끗한 16배는 도트 줄로 안 떨어진다",
  !/순도|흐트러|못 읽는다|네모가 아니라/.test(깨끗도트), 깨끗도트.slice(0, 120));
재기("깨끗한 것의 잰 값에 도트 16 이 적힌다", /도트_texel["\s:]+16/.test(깨끗));

/* ── ④ 뭉갠 것: 떨어지고, **몇인지**가 적히고, 모르는 수를 지어내지 않는다 ── */
const 뭉갬 = await 부르기("measure_image", { image_base64: 그림.blurred, want_texel: 16 });
const 뭉갬도트 = 도트줄(뭉갬);
재기("칸 안을 흐리면 도트 줄이 어긋남이다", /흐트러|순도/.test(뭉갬도트), 뭉갬도트.slice(0, 120));
재기("순도를 숫자로 알려 준다", /도트_purity/.test(뭉갬));
/* 운영 첫 판에서 "도트 48" 이라고 적었다. 진짜는 16 이다. */
재기("망가진 격자에서 도트 크기를 지어내지 않는다",
  뭉갬.includes("도트 크기는 못 읽는다") && !/도트_texel/.test(뭉갬),
  { 도트칸있나: /도트_texel/.test(뭉갬) });
재기("모르는 수로 직사각·주문어긋남을 말하지 않는다",
  !/네모가 아니라/.test(뭉갬) && !/≠ 주문/.test(뭉갬), 뭉갬도트.slice(0, 160));

/* ── ⑤ 비정수 배율: "격자 없음" 으로 조용히 통과하지 않는다 ── */
const 비정수 = await 부르기("measure_image", { image_base64: 그림.noninteger });
재기("비정수 배율은 흐트러짐으로 잡힌다", /흐트러/.test(도트줄(비정수)), 도트줄(비정수).slice(0, 120));

/* ── ⑥ 원본 해상도: 실패가 아니라 못 잼 ── */
const 원본 = await 부르기("measure_image", { image_base64: 그림.native });
재기("원본 해상도는 도트 줄로 안 떨어진다",
  !/흐트러|순도 0/.test(도트줄(원본)), 도트줄(원본).slice(0, 120));
재기("원본 해상도는 못 잼 칸에 적힌다", /격자가 없어/.test(원본), 원본.includes("격자가 없어"));

/* ── ⑦ 세트: 낱장으로는 절대 안 잡히는 고장 ── */
const 낱장a = await 부르기("measure_image", { image_base64: 그림.clean16 });
const 낱장b = await 부르기("measure_image", { image_base64: 그림.clean12 });
재기("도트 16 과 12 는 낱장으로는 둘 다 도트로 안 떨어진다",
  !낱장a.includes("도트 크기가 다르다") && !낱장b.includes("도트 크기가 다르다"));
const 세트 = await 부르기("measure_set", { images_base64: [그림.clean16, 그림.clean12] });
재기("세트로 내면 도트 크기 차이를 잡는다", 세트.includes("도트 크기가 다르다"), 도트줄(세트).slice(0, 120));
const 같은세트 = await 부르기("measure_set", { images_base64: [그림.clean16, 그림.clean16] });
재기("같은 도트 세트는 그 줄로 안 떨어진다", !같은세트.includes("도트 크기가 다르다"));
/* 깨끗한 것 + 망가진 것. 못 읽은 수로 "서로 다르다" 를 지어내면 안 된다. */
const 섞인세트 = await 부르기("measure_set", { images_base64: [그림.clean16, 그림.blurred] });
재기("못 읽은 도트로 세트 어긋남을 지어내지 않는다",
  !섞인세트.includes("도트 크기가 다르다") && 섞인세트.includes("흐트러"),
  도트줄(섞인세트).slice(0, 120));

/* ── ⑧ 안 물은 것이 못 잼 칸과 섞이지 않나 ── */
const 안물음 = await 부르기("measure_image", { image_base64: 그림.clean16 });
재기("주문 크기를 안 주면 '안 물은 것' 칸에 적힌다",
  안물음.includes("안 물은 것") && /안 물은 것[\s\S]*주문한 도트 크기/.test(안물음),
  { 칸: 안물음.includes("안 물은 것") });
재기("안 물은 것이 '못 잰 것 — 고치지 마라' 칸에 안 섞인다",
  !/못 잰 것 — \*\*고치지 마라\*\*[\s\S]*주문한 도트 크기/.test(안물음));

function 첫줄(t: string): string {
  return t.split("\n").filter((l) => l.trim()).slice(0, 3).join(" / ").slice(0, 150);
}

console.log("\n── 붙는 쪽이 보는 글 (뭉갠 것) ──\n" + 뭉갬);
console.log(나쁨 === 0 ? "\n전부 통과" : `\n${나쁨}개 실패`);
process.exit(나쁨 === 0 ? 0 : 1);
