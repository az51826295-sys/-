/**
 * Dodo Payments 값을 Railway(rookery-web)에 넣는다 (167회차 09-18). **값은 화면에 찍지 않는다** — 이름과 채워졌는지만.
 *   npx tsx engine/tools/dodo_env_push.mts          → 무엇이 채워졌는지만 본다(넣지 않음)
 *   npx tsx engine/tools/dodo_env_push.mts --push   → 넣는다(배포는 안 함). BILLING_PROVIDER=dodo 도 같이 넣는다.
 *   … --live [--push]  → 라이브 파일 %LOCALAPPDATA%\rookery-dot\dodo-live.json (DODO_ENV=live)
 * 파일: %LOCALAPPDATA%\rookery-dot\dodo.json  { env, apiKey, webhookSecret, productStarter, productPro }
 * 결제창을 실제로 여는 스위치(CHECKOUT_OPEN · NEXT_PUBLIC_CHECKOUT_OPEN)는 여기서 안 건드린다 — 사장님이 켠다.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const live = process.argv.includes("--live");
const path = `${process.env.LOCALAPPDATA}/rookery-dot/${live ? "dodo-live.json" : "dodo.json"}`;
console.log(live ? "라이브 파일" : "시험 파일");
const k = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
if (live !== (k.env === "live")) { console.error(`파일의 env("${k.env}")가 ${live ? "live" : "test"} 가 아니다 — 시험 값과 라이브 값을 섞지 않는다.`); process.exit(1); }
const map: [string, string][] = [
  ["BILLING_PROVIDER", "dodo"],
  ["DODO_ENV", live ? "live" : "test"],
  ["DODO_API_KEY", k.apiKey ?? ""],
  ["DODO_WEBHOOK_SECRET", k.webhookSecret ?? ""],
  ["DODO_PRODUCT_STARTER", k.productStarter ?? ""],
  ["DODO_PRODUCT_PRO", k.productPro ?? ""],
];
const shape: Record<string, RegExp> = {
  DODO_WEBHOOK_SECRET: /^whsec_[A-Za-z0-9+/=]+$/,
  DODO_PRODUCT_STARTER: /^pdt_[A-Za-z0-9]+$/,
  DODO_PRODUCT_PRO: /^pdt_[A-Za-z0-9]+$/,
};
let missing = 0;
for (const [name, value] of map) {
  const ok = !!value && (!shape[name] || shape[name].test(value));
  if (!ok) missing++;
  console.log(`${ok ? "채워짐" : value ? "형식 이상" : "비어 있음"}  ${name}`);
}
if (!process.argv.includes("--push")) process.exit(missing ? 1 : 0);
if (missing) { console.error("빈 칸이나 형식이 이상한 값이 있어 넣지 않았어요."); process.exit(1); }

for (const [name, value] of map) {
  // 값은 인자로만 넘기고, CLI 출력은 버린다(값이 섞여 나올 수 있어서). 성공 여부만 본다.
  const r = spawnSync("railway", ["variables", "--service", "rookery-web", "--skip-deploys", "--set", `"${name}=${value}"`], { shell: process.platform === "win32", stdio: ["ignore", "ignore", "ignore"] });
  console.log(`${r.status === 0 ? "넣음" : "실패"}  ${name}`);
  if (r.status !== 0) process.exit(1);
}
