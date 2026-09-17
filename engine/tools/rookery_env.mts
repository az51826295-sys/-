/**
 * 로키(rookery-main) DB 로 도구 돌리기 — .env.local 은 09-11 부터 두근도트를 가리킨다(92회차 09-12).
 * 열쇠는 %LOCALAPPDATA%/rookery-dot/rookery-main-keys.json 에 있다(저장소 밖). 값을 찍지 않는다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/selfcheck.mts 7
 *   npx tsx engine/tools/rookery_env.mts engine/tools/routing_test.mts
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const k = JSON.parse(readFileSync(`${process.env.LOCALAPPDATA}/rookery-dot/rookery-main-keys.json`, "utf8")) as { url: string; anon: string; service: string };
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
