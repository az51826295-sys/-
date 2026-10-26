/**
 * **MCP 문이 사람별로 열리나** (10-26). 모델 0 · 값 0 · DB 0.
 *   npx tsx engine/work/probe/mcp-auth-test.mts [--sabotage]
 *
 * 로키 DB 가 끊겨 있어서 진짜 질의는 못 돌린다. 그런데 **갈래는 전부 잴 수 있다** —
 * 회사 찾는 일을 가짜로 넣는다. 못 재는 건 "그 열쇠로 진짜 회사가 나오나" 하나뿐이다.
 *
 * 제일 중요한 두 줄:
 *   · 남의 열쇠로는 **안 열린다** (오전 판은 열쇠가 하나라 모두가 같이 열렸다)
 *   · **DB 에 못 닿은 것을 "열쇠가 틀렸다" 로 적지 않는다**
 */
import { authenticateMcp, readMcpKey, mcpRefusal, type FoundCompany } from "../../../src/lib/hand/mcpAuth";

const 심기 = process.argv.includes("--sabotage");
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => {
  if (!ok) 나쁨++;
  console.log((ok ? "통과" : "실패") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본)));
};

const 전역 = "rk_서버열쇠_abcdefghijklmnop";
const 가가열쇠 = "rk_가가가가가가가가가가가가가";
const 나나열쇠 = "rk_나나나나나나나나나나나나나";

/** 가짜 장부 — 열쇠 두 개만 안다. */
const 장부: Record<string, string> = { [가가열쇠]: "company-가", [나나열쇠]: "company-나" };
const 찾기 = async (k: string): Promise<FoundCompany> =>
  장부[k] ? { kind: "회사", id: 장부[k] } : { kind: "없음" };
const DB죽음 = async (): Promise<FoundCompany> => ({ kind: "DB못닿음", why: "TypeError: fetch failed" });

/* 심은 판: 뭘 들고 와도 열어 주는 문. 자가 멀쩡하면 거부 쪽 줄들이 떨어져야 한다. */
const 문 = 심기
  ? async (key: string | null) => (key ? { kind: "회사" as const, id: "company-가" } : { kind: "열쇠없음" as const })
  : (key: string | null) => authenticateMcp(key, { globalToken: 전역, findCompany: 찾기 });

/* ── ① 헤더에서 열쇠 꺼내기 ── */
const 헤더 = (o: Record<string, string>) => (n: string) => o[n.toLowerCase()] ?? null;
재기("Bearer 에서 꺼낸다", readMcpKey(헤더({ authorization: "Bearer " + 가가열쇠 })) === 가가열쇠);
재기("bearer 대소문자 섞여도 꺼낸다", readMcpKey(헤더({ authorization: "bEaReR " + 가가열쇠 })) === 가가열쇠);
재기("x-rookery-mcp 도 받는다", readMcpKey(헤더({ "x-rookery-mcp": 나나열쇠 })) === 나나열쇠);
재기("아무것도 없으면 null", readMcpKey(헤더({})) === null);
재기("Bearer 뒤가 비면 null", readMcpKey(헤더({ authorization: "Bearer   " })) === null);

/* ── ② 누구인지 가린다 ── */
재기("열쇠 없으면 열쇠없음", (await 문(null)).kind === "열쇠없음");
재기("전역 열쇠는 서버열쇠", (await 문(전역)).kind === (심기 ? "회사" : "서버열쇠"));

const 가 = await 문(가가열쇠);
재기("가가 열쇠 → 가가 회사", 가.kind === "회사" && 가.id === "company-가", { 결과: 가 });

const 나 = await 문(나나열쇠);
재기("나나 열쇠 → 나나 회사", 나.kind === "회사" && 나.id === "company-나", { 결과: 나 });

/* **여기가 오전 판에 없던 줄이다** — 남의 열쇠로는 안 열린다 */
const 모르는것 = await 문("rk_아무거나_내가_지어낸_것");
재기("모르는 열쇠는 막는다", 모르는것.kind === "열쇠틀림", { 결과: 모르는것 });
재기("빈 문자열은 막는다", (await 문("")).kind === "열쇠없음");

/* ── ③ 전역 열쇠가 없어도 사람별은 돌아야 한다 ── */
if (!심기) {
  const 전역없이 = (k: string | null) => authenticateMcp(k, { globalToken: null, findCompany: 찾기 });
  const r1 = await 전역없이(가가열쇠);
  재기("전역 열쇠 없어도 사람 열쇠는 열린다", r1.kind === "회사", { 결과: r1 });
  const r2 = await 전역없이("rk_아무거나");
  재기("전역 열쇠 없을 때 아무나 열리지 않는다", r2.kind === "열쇠틀림", { 결과: r2 });
  const r3 = await 전역없이(전역);
  재기("전역 열쇠가 설정 안 됐으면 그 값도 안 통한다", r3.kind === "열쇠틀림", { 결과: r3 });
}

/* ── ④ DB 가 죽었을 때 — 틀렸다고 적으면 안 된다 ── */
if (!심기) {
  const 죽음 = await authenticateMcp(가가열쇠, { globalToken: 전역, findCompany: DB죽음 });
  재기("DB 못 닿으면 DB못닿음", 죽음.kind === "DB못닿음", { 결과: 죽음 });
  재기("DB 못 닿으면 503", mcpRefusal(죽음).status === 503, { 답: mcpRefusal(죽음) });
  재기("DB 못 닿을 때 '틀렸다' 고 안 쓴다", !mcpRefusal(죽음).error.includes("맞지 않"), { 말: mcpRefusal(죽음).error });
  /* DB 가 죽어도 전역 열쇠는 통해야 한다 — 그래야 내가 고치러 들어갈 수 있다 */
  const 서버 = await authenticateMcp(전역, { globalToken: 전역, findCompany: DB죽음 });
  재기("DB 죽어도 전역 열쇠는 통한다", 서버.kind === "서버열쇠", { 결과: 서버 });
}

/* ── ⑤ 거부 문구 ── */
재기("열쇠없음은 401 이고 받는 곳을 알려 준다",
  mcpRefusal({ kind: "열쇠없음" }).status === 401 && mcpRefusal({ kind: "열쇠없음" }).error.includes("내 연결 열쇠"));
재기("열쇠틀림은 403", mcpRefusal({ kind: "열쇠틀림" }).status === 403);

if (심기) {
  console.log(나쁨 ? `\n심은 판에서 ${나쁨}개 잡았다 — 자가 산다` : "\n**심었는데 다 통과했다 — 자가 눈멀었다**");
  process.exit(나쁨 ? 0 : 1);
}
console.log("\n못 잰 것: 진짜 열쇠로 진짜 회사가 나오나 — 로키 DB 가 끊겨 있다.");
console.log(나쁨 ? `\n**${나쁨}개 실패**` : "\n전부 통과");
process.exit(나쁨 ? 1 : 0);
