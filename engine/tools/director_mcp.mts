/**
 * **로키 판단 엔진 — 손님 컴퓨터에서 도는 MCP 서버** (저장소 안에서 쓰는 손잡이).
 * 본체는 `src/lib/director/server.ts` — 설치용 꾸러미(`packages/director`)와 같은 코드다(11-21).
 *
 *   npx tsx engine/tools/director_mcp.mts            (stdio — 사람이 직접 돌릴 일은 없다)
 *
 * 환경:
 *   DIRECTOR_HOME   장부·자리 파일 폴더(기본 ~/.rookery/director)
 *   DIRECTOR_BRAIN  판단자 모델(기본 gpt-5.6-luna — 11-20 싼 판단자 실험). `mock` 이면 모델을 안 부른다(시험용)
 *   DIRECTOR_PRESET 자리 파일이 없을 때 처음 깔 목록: claude-code(기본) | openai
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const 저장소 = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envFile = join(저장소, ".env.local");
if (existsSync(envFile)) for (const l of readFileSync(envFile, "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim().replace(/\r$/, "");
}
const { startDirectorServer } = await import("../../src/lib/director/server.ts");
const { seatProvider } = await import("../../src/lib/skills/appBuild/seats.ts");
const { costOf } = await import("../../src/lib/costs/pricing.ts");
startDirectorServer({
  home: process.env.DIRECTOR_HOME || join(homedir(), ".rookery", "director"),
  brainModel: process.env.DIRECTOR_BRAIN || "gpt-5.6-luna",
  preset: process.env.DIRECTOR_PRESET,
  makeBrain: (m) => seatProvider(m),
  meter: (u) => costOf({ backend: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens }),
  // 판매 주소는 license.ts 의 SALE 한 곳. 환경변수는 시험용 덮어쓰기.
  license: { validateUrl: process.env.DIRECTOR_LICENSE_VALIDATE_URL, buyUrl: process.env.DIRECTOR_BUY_URL },
  licenseKey: process.env.ROOKERY_LICENSE,
});
