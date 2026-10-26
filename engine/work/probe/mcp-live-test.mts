/**
 * **클로드 코드가 로키에 붙나** (10-26). 모델 0 · 값 0.
 *   npx tsx engine/work/probe/mcp-live-test.mts [주소]
 *
 * 코드만 써 놓고 "붙는다" 고 적지 않으려고 만든다 —
 * 진짜 JSON-RPC 로 말을 걸어서, 남의 도구가 보게 될 것을 그대로 받아 본다.
 *
 * 재는 것: 열쇠 없으면 막나 · 손 흔들기(initialize) · 도구 목록 ·
 *          기준을 숫자로 내주나 · 진짜 그림을 재서 **세 값 중 하나**로 돌려주나.
 * 못 재는 것: 클로드 코드가 실제로 이 서버를 등록하는 것(그건 사장님 손가락).
 */
import { readFileSync, existsSync } from "node:fs";

const 터 = process.argv[2] ?? "http://127.0.0.1:3000";
const 길 = 터 + "/api/mcp";
const 열쇠 = (JSON.parse(readFileSync(".keys/mcp.json", "utf8")) as { MCP_TOKEN: string }).MCP_TOKEN;

let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => {
  if (!ok) 나쁨++;
  console.log((ok ? "통과" : "실패") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본)));
};

type 답 = { status: number; body: Record<string, unknown> };
async function 말걸기(method: string, params?: unknown, 열쇠넣나 = true): Promise<답> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (열쇠넣나) headers.authorization = "Bearer " + 열쇠;
  const r = await fetch(길, {
    method: "POST", headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(150_000),
  });
  const t = await r.text();
  let body: Record<string, unknown> = {};
  try { body = t ? JSON.parse(t) as Record<string, unknown> : {}; } catch { body = { raw: t.slice(0, 200) }; }
  return { status: r.status, body };
}

/* ── ① 문이 잠겨 있나 — 남이 우리 판정 서비스를 공짜로 쓰면 안 된다 ── */
const 열쇠없이 = await 말걸기("tools/list", undefined, false);
재기("열쇠 없으면 막는다", 열쇠없이.status === 401, { status: 열쇠없이.status });

/* ── ② 손 흔들기 ── */
const init = await 말걸기("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "probe", version: "0" } });
const ir = init.body.result as { protocolVersion?: string; serverInfo?: { name?: string }; capabilities?: Record<string, unknown> } | undefined;
재기("손을 흔들어 준다", init.status === 200 && !!ir?.serverInfo?.name, { 이름: ir?.serverInfo?.name, 판: ir?.protocolVersion });
재기("도구를 쓸 수 있다고 말한다", !!ir?.capabilities && "tools" in (ir.capabilities ?? {}), { capabilities: ir?.capabilities });

/* ── ③ 도구 목록 — 남의 도구는 이 글을 읽고 부를지 정한다 ── */
const list = await 말걸기("tools/list");
const tools = ((list.body.result as { tools?: { name: string; description: string; inputSchema?: unknown }[] })?.tools) ?? [];
재기("도구를 셋 다 내놓는다", tools.length === 3, { 도구: tools.map((t) => t.name) });
재기("도구마다 설명이 붙어 있다", tools.every((t) => (t.description ?? "").length > 30));
재기("도구마다 입력 모양이 붙어 있다", tools.every((t) => !!t.inputSchema));

/* ── ④ 기준을 숫자로 내주나 ── */
const std = await 말걸기("tools/call", { name: "get_standard", arguments: {} });
const 기준글 = ((std.body.result as { content?: { text?: string }[] })?.content?.[0]?.text) ?? "";
재기("기준을 내준다", 기준글.length > 50, { 글자: 기준글.length });
재기("기준에 숫자가 박혀 있다", /min_colors|min_luma_spread/.test(기준글));
재기("기준에 근거가 적혀 있다", 기준글.includes("근거") || 기준글.includes("basis"));
재기("세 값을 가르라고 알려 준다", 기준글.includes("못 잼"));
if (기준글) console.log("   기준 첫 줄:", 기준글.split("\n").find((l) => l.includes("min_")) ?? "(숫자 줄 못 찾음)");

/* ── ⑤ 진짜 그림을 재 보나 — 여기가 "일관성" 이 실제로 생기는 자리다 ── */
const 후보 = ["public/dot-sprites/haru/face/happy.png", "public/dot-sprites/nabi/face/happy.png", "public/ash/art/c-knight.png"];
const 그림길 = 후보.find((p) => existsSync(p));
if (!그림길) {
  console.log("\n못 잼: 보낼 그림을 못 찾았다 — 후보 경로가 다 없다.");
  나쁨++;
} else {
  const b64 = readFileSync(그림길).toString("base64");
  const t0 = Date.now();
  const m = await 말걸기("tools/call", { name: "measure_image", arguments: { image_base64: b64 } });
  const 걸림 = Date.now() - t0;
  const 글 = ((m.body.result as { content?: { text?: string }[] })?.content?.[0]?.text) ?? "";
  console.log(`\n보낸 그림: ${그림길} (${Math.round(b64.length / 1024)}KB) → ${걸림}ms`);
  재기("재서 돌려준다", 글.length > 10, { 글자: 글.length });
  /* 세 값 중 하나여야 한다 — 아무 말도 안 하면 붙여 놓은 쪽이 못 고친다 */
  재기("판정이 세 값 중 하나다", /맞음|어긋남|못 잼/.test(글), { 첫줄: 글.split("\n")[0] });
  재기("잰 숫자를 같이 준다", 글.includes("잰 값") || /\d/.test(글), { 숫자있나: 글.includes("잰 값") });
  console.log("   돌아온 글:\n" + 글.split("\n").map((l) => "     " + l).join("\n"));
}

/* ── ⑥ 모르는 도구를 부르면 — 조용히 통과시키면 안 된다 ── */
const 헛것 = await 말걸기("tools/call", { name: "없는도구", arguments: {} });
const 헛글 = ((헛것.body.result as { isError?: boolean; content?: { text?: string }[] }));
재기("없는 도구는 오류로 말한다", 헛글?.isError === true, { 답: 헛글?.content?.[0]?.text?.slice(0, 60) });

console.log(나쁨 ? `\n**${나쁨}개 실패**` : "\n전부 통과");
process.exit(나쁨 ? 1 : 0);
