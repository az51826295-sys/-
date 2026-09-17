/**
 * Paddle 값을 Railway(rookery-web)에 넣는다 (100회차 09-13). **값은 화면에 찍지 않는다** — 이름과 채워졌는지만.
 *   npx tsx engine/tools/paddle_env_push.mts          → 무엇이 채워졌는지만 본다(넣지 않음)
 *   npx tsx engine/tools/paddle_env_push.mts --push   → 넣는다(배포는 안 함; 켜는 건 BILLING_OPEN 따로)
 *   … --live [--push]  → 라이브 파일 %LOCALAPPDATA%\rookery-dot\paddle-live.json (PADDLE_ENV=production)
 * 파일: %LOCALAPPDATA%\rookery-dot\paddle.json  { env, clientToken, webhookSecret, priceStarter, pricePro } (월 반복 가격, 09-13 구독으로 바꿈)
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// --live 이면 라이브 파일(paddle-live.json). 샌드박스 값과 섞이지 않게 파일을 나눈다.
const live = process.argv.includes("--live");
const path = `${process.env.LOCALAPPDATA}/rookery-dot/${live ? "paddle-live.json" : "paddle.json"}`;
console.log(live ? "라이브 파일" : "샌드박스 파일");
const k = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
const map: [string, string][] = [
  ["PADDLE_ENV", k.env || "sandbox"],
  ["NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", k.clientToken ?? ""],
  ["PADDLE_WEBHOOK_SECRET", k.webhookSecret ?? ""],
  ["PADDLE_PRICE_STARTER", k.priceStarter ?? ""],
  ["PADDLE_PRICE_PRO", k.pricePro ?? ""],
];
const shape: Record<string, RegExp> = {
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: /^(test|live)_[A-Za-z0-9]+$/,
  PADDLE_WEBHOOK_SECRET: /^pdl_ntfset_[A-Za-z0-9_+/=]+$/,
  PADDLE_PRICE_STARTER: /^pri_[a-z0-9]+$/,
  PADDLE_PRICE_PRO: /^pri_[a-z0-9]+$/,
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
