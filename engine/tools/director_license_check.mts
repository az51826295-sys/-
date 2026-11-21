/**
 * 값 받는 문(src/lib/director/license.ts) 자 — 11-21.
 *
 *   npx tsx engine/tools/director_license_check.mts          가짜 결제사로(돈·망 0)
 *   npx tsx engine/tools/director_license_check.mts --dodo   Dodo **시험 모드**에서 진짜 키를 만들어 공개 확인 주소로 묻는다($0)
 *
 * 이빨: 막혀야 할 판(키 없음·틀린 키·만료 키·유예 넘김)이 실제로 막히는지 같이 잰다 — 통과만 보면 늘 여는 문도 통과한다.
 */
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { gate, usedThisMonth, PLAN } from "../../src/lib/director/license";

let 맞음 = 0, 틀림 = 0;
const 봄 = (이름: string, ok: boolean, 보임 = "") => { ok ? 맞음++ : 틀림++; console.log(`${ok ? "✅" : "❌"} ${이름}${보임 ? ` — ${보임}` : ""}`); };
const 새집 = () => mkdtempSync(join(tmpdir(), "director-lic-"));
const CFG = { validateUrl: "https://pay.example/validate", buyUrl: "https://pay.example/buy" };
const N = PLAN.freePerMonth;

// 가짜 결제사: 키 → 답. 부른 횟수를 센다.
function 가짜(답: Record<string, boolean | "down">) {
  const f = Object.assign(async (_u: string, init: { body: string }) => {
    f.calls++;
    const k = JSON.parse(init.body).license_key as string;
    if (답[k] === "down") throw new Error("ECONNREFUSED");
    return new Response(JSON.stringify({ valid: 답[k] === true }), { status: 200 });
  }, { calls: 0 });
  return f;
}

{
  const h = 새집();
  봄("파는 주소가 없으면 판 수 상관없이 연다", (await gate(h, 10 * N, undefined, { validateUrl: "https://pay.example/validate" })).ok);
  const 실 = await gate(h, N, undefined, {});
  봄("판매 설정(SALE) 그대로면 무료 뒤 막고 Polar 결제 링크를 준다", !실.ok && 실.message.includes("buy.polar.sh"));
  봄("판매 설정 그대로도 무료 안에선 연다", (await gate(h, N - 1, undefined, {})).ok);
  봄(`무료 ${N - 1}판째는 키 없이 연다`, (await gate(h, N - 1, undefined, CFG)).ok);
  const r = await gate(h, N, undefined, CFG);
  봄(`${N}판째 키 없으면 막고 살 곳을 알려 준다`, !r.ok && r.message.includes(CFG.buyUrl) && r.message.includes("ROOKERY_LICENSE"), !r.ok ? r.message.slice(0, 60) : "");

  const f = 가짜({ GOOD: true, BAD: false });
  const t0 = new Date("2026-11-21T00:00:00Z");
  봄("유효한 키는 연다", (await gate(h, N + 5, "GOOD", CFG, { fetch: f as never, now: t0 })).ok && f.calls === 1);
  봄("키 파일에 키 원문이 안 남는다", !readFileSync(join(h, "license.json"), "utf8").includes("GOOD"));
  await gate(h, N + 6, "GOOD", CFG, { fetch: f as never, now: new Date(t0.getTime() + 3600_000) });
  봄("하루 안엔 다시 안 묻는다", f.calls === 1, `부름 ${f.calls}`);
  const bad = await gate(h, N + 6, "BAD", CFG, { fetch: f as never, now: t0 });
  봄("다른 키면 다시 묻고, 틀린 키는 막는다", !bad.ok && f.calls === 2);
  rmSync(h, { recursive: true, force: true });
}
{
  const h = 새집(), t0 = new Date("2026-11-21T00:00:00Z");
  await gate(h, N, "K", CFG, { fetch: 가짜({ K: true }) as never, now: t0 });
  const down = 가짜({ K: "down" });
  봄("결제사가 안 닿아도 마지막 유효 뒤 7일 안이면 연다", (await gate(h, N, "K", CFG, { fetch: down as never, now: new Date(t0.getTime() + 3 * 86400_000) })).ok);
  봄("7일을 넘기면 막는다", !(await gate(h, N, "K", CFG, { fetch: down as never, now: new Date(t0.getTime() + 8 * 86400_000) })).ok);
  rmSync(h, { recursive: true, force: true });
}
{
  const h = 새집();
  봄("한 번도 확인 못 한 키는 결제사가 안 닿으면 막는다", !(await gate(h, N, "NEW", CFG, { fetch: 가짜({ NEW: "down" }) as never })).ok);
  rmSync(h, { recursive: true, force: true });
}
{
  const now = new Date("2026-11-21T00:00:00Z");
  const rows = [
    { at: "2026-11-02T00:00:00Z", via: "판단자" }, { at: "2026-11-03T00:00:00Z", via: "장부" },
    { at: "2026-11-04T00:00:00Z", via: "올림" }, { at: "2026-10-30T00:00:00Z", via: "판단자" },
  ];
  봄("이번 달만 세고 엔진이 연 올림 판은 안 센다", usedThisMonth(rows, now) === 2);
}

{
  // Polar 모양: { key, organization_id } → 200 + status. 없는 키는 404.
  const P = { provider: "polar" as const, validateUrl: "https://polar.example/validate", organizationId: "org-1", buyUrl: "https://polar.example/buy" };
  const 폴라 = (답: Record<string, number | string>) => (async (_u: string, init: { body: string }) => {
    const b = JSON.parse(init.body) as { key: string; organization_id: string };
    if (b.organization_id !== "org-1") return new Response("{}", { status: 422 });
    const a = 답[b.key]; return typeof a === "number" ? new Response('{"error":"ResourceNotFound"}', { status: a }) : new Response(JSON.stringify({ status: a }), { status: 200 });
  }) as never;
  const f = 폴라({ G: "granted", R: "revoked", X: 404 });
  const 판 = async (k: string) => { const h = 새집(); const r = await gate(h, N, k, P, { fetch: f }); rmSync(h, { recursive: true, force: true }); return r.ok; };
  봄("Polar: granted 키는 연다", await 판("G"));
  봄("Polar: 해지(revoked) 키는 막는다", !(await 판("R")));
  봄("Polar: 없는 키(404)는 막는다", !(await 판("X")));
}
if (process.argv.includes("--polar")) {
  // 진짜 Polar 공개 확인 주소 + 우리 조직 id(SALE). 없는 키가 막히는지만 잰다 — 진짜 키는 첫 구매 뒤에.
  const h = 새집();
  const r = await gate(h, N, `RD-NOT-REAL-${randomBytes(4).toString("hex")}`, { buyUrl: "https://polar.example/buy" });
  봄("Polar 실서버: 없는 키는 막는다(SALE 설정 그대로)", !r.ok && /유효하지 않습니다/.test(r.message), r.ok ? r.why : r.message.slice(0, 30));
  rmSync(h, { recursive: true, force: true });
}
if (process.argv.includes("--dodo")) {
  // 시험 모드 열쇠 파일(dodo.json). 열쇠 값은 찍지 않는다.
  const cfgFile = join(process.env.LOCALAPPDATA ?? "", "rookery-dot", "dodo.json");
  const d = JSON.parse(readFileSync(cfgFile, "utf8")) as { env: string; apiKey: string; productPro: string; productDirectorPro?: string };
  if (d.env !== "test") throw new Error("dodo.json 이 시험 모드가 아니다 — 라이브에서 키를 만들지 않는다");
  const 바탕 = "https://test.dodopayments.com";
  const api = async (path: string, body: unknown) => {
    const r = await fetch(바탕 + path, { method: "POST", headers: { authorization: `Bearer ${d.apiKey}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text(); if (!r.ok) throw new Error(`${path} ${r.status} ${t.slice(0, 200)}`); return JSON.parse(t);
  };
  const 손님 = await api("/customers", { name: "director license check", email: "director-check@example.com" });
  const 좋은키 = `rd-test-${randomBytes(8).toString("hex")}`, 지난키 = `rd-test-${randomBytes(8).toString("hex")}`;
  await api("/license_keys", { key: 좋은키, customer_id: 손님.customer_id, product_id: d.productDirectorPro });
  await api("/license_keys", { key: 지난키, customer_id: 손님.customer_id, product_id: d.productDirectorPro, expires_at: "2026-01-01T00:00:00Z" });
  const real = { validateUrl: `${바탕}/licenses/validate`, buyUrl: "https://pay.example/buy" };
  for (const [이름, 키, 기대] of [["Dodo 시험: 만든 키는 연다", 좋은키, true], ["Dodo 시험: 없는 키는 막는다", `rd-test-${randomBytes(8).toString("hex")}`, false], ["Dodo 시험: 만료된 키는 막는다", 지난키, false]] as const) {
    const h = 새집();
    const r = await gate(h, N, 키, real);
    봄(이름, r.ok === 기대, r.ok ? r.why : r.message.slice(0, 40));
    rmSync(h, { recursive: true, force: true });
  }
  // 서버 한 바퀴: 이번 달 N판 찬 장부 → 키 없으면 decide 가 막히고, 좋은 키면 열린다(설치용 꾸러미 그대로).
  // 입력을 닫으면 서버가 스스로 끝나야 한다(안 끝나면 여기서 60초 시간 초과로 드러난다).
  const { spawnSync } = await import("node:child_process");
  const 서버 = process.env.DIRECTOR_SERVER ?? "packages/director/dist/cli.mjs";
  const 한바퀴 = (key?: string) => {
    const h = 새집(), at = new Date().toISOString();
    writeFileSync(join(h, "ledger.json"), JSON.stringify(Array.from({ length: N }, (_, i) => ({ id: "r" + i, at, task: "t", kind: "찾기", seat: "haiku", effort: "가볍게", predictedPass: 0.8, via: "판단자", judgeUsd: 0 }))));
    const 줄 = [{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "director_decide", arguments: { task: "오타", kind: "찾기" } } }].map((m) => JSON.stringify(m)).join("\n") + "\n";
    const env = { ...process.env, DIRECTOR_HOME: h, DIRECTOR_BRAIN: "mock", DIRECTOR_LICENSE_VALIDATE_URL: real.validateUrl, DIRECTOR_BUY_URL: real.buyUrl, ROOKERY_LICENSE: key ?? "" };
    const t = Date.now();
    const r = spawnSync(process.execPath, [서버], { input: 줄, env, encoding: "utf8", timeout: 60_000 });
    rmSync(h, { recursive: true, force: true });
    const m = r.stdout.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((x) => x.id === 2);
    return { res: m?.result as { isError?: boolean; content: { text: string }[] } | undefined, 끝남: r.status === 0 && Date.now() - t < 30_000 };
  };
  const 막힘 = 한바퀴();
  봄("서버: 무료 다 쓰고 키 없으면 decide 가 막힌다", !!막힘.res?.isError && 막힘.res.content[0].text.includes("ROOKERY_LICENSE"));
  봄("서버: 입력이 닫히면 스스로 끝난다", 막힘.끝남);
  const 열림 = 한바퀴(좋은키);
  봄("서버: 좋은 키면 decide 가 열린다", !!열림.res && !열림.res.isError && /맡길 AI/.test(열림.res.content[0].text));
}

console.log(`\n${맞음}/${맞음 + 틀림}`);
process.exit(틀림 ? 1 : 0);
void existsSync;
