/**
 * 로키(rookery-main) DB 로 도구 돌리기 — .env.local 은 09-11 부터 두근도트를 가리킨다(92회차 09-12).
 * 열쇠는 %LOCALAPPDATA%/rookery-dot/rookery-main-keys.json 에 있다(저장소 밖). 값을 찍지 않는다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/selfcheck.mts 7
 *   npx tsx engine/tools/rookery_env.mts engine/tools/routing_test.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
/**
 * **열쇠는 여러 자리에서 찾는다** (10-12).
 *
 * 전에는 `%LOCALAPPDATA%/rookery-dot/` 한 자리만 보고, 없으면 **생짜 스택**을 뱉고 죽었다.
 * 그래서 주간 작업(RookeryWeeklyNextWork)이 09-27 에 만들어진 뒤 **한 번도 성공한 적이 없는데**
 * 로그에는 `ENOENT ... at readFileSync` 만 남아 "파일이 왜 없지" 로 세 주를 보냈다.
 *
 * 실측(10-12): 작업 스케줄러에서 `%LOCALAPPDATA%` 를 통째로 훑으니 **`rookery-dot` 이 없다.**
 * 같은 폴더가 내 세션에서는 보인다 — 즉 **보는 자리에 따라 있고 없다.**
 * 그러니 한 자리만 믿으면 안 된다. 찾은 자리를 적고, 못 찾으면 **본 자리를 전부 적고** 죽는다.
 */
const 열쇠자리 = [
  process.env.ROOKERY_KEYS,                                            // 손으로 집어 줄 수 있게
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/rookery-dot/rookery-main-keys.json`,
  process.env.USERPROFILE && `${process.env.USERPROFILE}/.rookery/rookery-main-keys.json`,
  resolve(".keys/rookery-main-keys.json"),                             // 저장소 안(.gitignore 됨)
].filter(Boolean) as string[];
const 찾음 = 열쇠자리.find((p) => existsSync(p));
if (!찾음) {
  console.error("로키 열쇠를 못 찾았다. 본 자리:");
  for (const p of 열쇠자리) console.error(`  · ${p}`);
  console.error("한 자리에 두면 된다. 작업 스케줄러에서 돌리려면 **저장소 안(.keys/)** 이 확실하다");
  console.error("— %LOCALAPPDATA% 는 보는 자리에 따라 안 보인다(10-12 실측).");
  process.exit(1);
}
const k = JSON.parse(readFileSync(찾음, "utf8")) as { url: string; anon: string; service: string };
process.env.NEXT_PUBLIC_SUPABASE_URL = k.url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = k.anon;
process.env.SUPABASE_SECRET_KEY = k.service;
process.env.PRODUCT = "rookery";
// 모델 열쇠는 .env.local 것 그대로(도구가 읽는다). AI_PROVIDER 는 mock 이 아니게.
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) { const key = l.slice(0, i).trim(); if (!(key in process.env) && !key.startsWith("NEXT_PUBLIC_SUPABASE") && key !== "SUPABASE_SECRET_KEY") process.env[key] = l.slice(i + 1).trim(); } }
if (process.env.AI_PROVIDER === "mock") process.env.AI_PROVIDER = "deepseek";
const target = process.argv[2];
if (!target) { console.error("대상 도구 경로가 필요하다"); process.exit(1); }
process.argv.splice(2, 1);
console.log(`[로키 DB] ${k.url.replace(/(https:\/\/[a-z]{6})[a-z]*/, "$1…")} · ${target}`);
await import(pathToFileURL(resolve(target)).href);
