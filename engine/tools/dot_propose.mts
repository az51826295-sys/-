/**
 * **두근도트에서 무엇을 고칠지 로키가 고른다** (226회차 2026-09-28).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/dot_propose.mts
 *
 * 사장님 09-28: *"로키한테 두근도트 업데이트 맡겨봐."*
 *
 * **맡긴다는 것은 내가 정하지 않는 것이다.** 내가 `--ask` 를 쓰면 로키는 내 말을 옮긴 손일 뿐이다.
 * 그래서 로키에게 코드 목록과 최근 기록을 주고 **고칠 것 하나와 그것을 재는 자**를 고르게 한다.
 * 그 답을 그대로 `self_fix --ask … --ruler …` 에 넣는다.
 *
 * 로키에게 준 것: 두근도트 파일 목록(줄 수), 최근 두근도트 커밋, 그리고 **지금 있는 자 목록**.
 * 안 준 것: 내 의견. 무엇이 문제인지 내가 말하면 그건 내 제안이다.
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { z } from "zod";

const { defaultProviders } = await import("../../src/lib/execution/shared");

const 줄수 = (p: string) => {
  try { return readFileSync(p, "utf-8").split("\n").length; } catch { return 0; }
};
/**
 * **이름만 주면 로키는 짐작한다.** 09-28 첫 판에서 파일 이름과 줄 수만 줬더니
 * "말풍선을 3개로 제한하자" 를 골랐는데 — `bubbles.ts` 에 `MAX_BUBBLES = 3` 이 **이미 있었다.**
 * 이름을 보고 없는 문제를 지어낸 것이고, **재료를 안 준 내 잘못**이다.
 * 그래서 파일마다 머리 주석과 내보내는 것을 같이 준다(전문은 너무 크다).
 */
const 속 = (path: string): string => {
  let t = "";
  try { t = readFileSync(path, "utf-8"); } catch { return ""; }
  const 줄 = t.split("\n");
  const 머리 = 줄.slice(0, 12).filter((l) => l.trim().startsWith("*")).slice(0, 6);
  const 내보냄 = 줄.filter((l) => l.startsWith("export ")).slice(0, 14);
  return [...머리, ...내보냄].join("\n");
};
const 속목록 = (dir: string) =>
  readdirSync(dir)
    .filter((f) => /\.(ts|tsx)$/.test(f) && statSync(`${dir}/${f}`).isFile())
    .map((f) => `\n### ${dir}/${f} (${줄수(`${dir}/${f}`)}줄)\n${속(`${dir}/${f}`)}`)
    .join("\n");

const 목록 = (dir: string) =>
  readdirSync(dir)
    .filter((f) => /\.(ts|tsx)$/.test(f) && statSync(`${dir}/${f}`).isFile())
    .map((f) => `- ${dir}/${f} (${줄수(`${dir}/${f}`)}줄)`)
    .join("\n");

const 커밋 = execSync('git log --oneline -14 -- src/lib/dot src/app/dot engine/tools/dot_*', { encoding: "utf-8" }).trim();
const 자들 = readdirSync("engine/tools").filter((f) => f.startsWith("dot_")).map((f) => `- engine/tools/${f}`).join("\n");

const schema = z.object({
  고칠것: z.string().describe("한 줄. 무엇을 어떻게 바꾸는가. 파일 이름을 포함해라."),
  재는자: z.string().describe("기계가 무엇으로 잴 수 있나. 모델 판단 말고 숫자나 참거짓으로."),
  왜: z.string().describe("왜 이것인가. 두 줄 이내."),
  손댈파일: z.array(z.string()).describe("실제로 고칠 파일 경로. 3개 이하. src/lib/dot 안이어야 한다."),
  위험: z.string().describe("이 고침이 손님에게 잘못 보일 수 있는 지점. 없으면 '없다'."),
});

const SYS = [
  "너는 이 회사(로키)의 개발자다. **두근도트**는 이 회사가 만든 2D 도트 캐릭터 채팅 앱이고,",
  "지금 손님 11명이 534번 대화했다. 너는 지금 두근도트에서 **고칠 것 하나**를 스스로 고른다.",
  "",
  "고르는 규칙:",
  "- **조각으로 고칠 수 있는 것**을 골라라. 통째로 다시 쓰는 일은 못 한다(파일 3개 이하).",
  "- **기계가 잴 수 있는 것**을 골라라. '더 자연스럽게' 같은 것은 못 잰다 —",
  "  숫자(글자 수·초·개수)나 참거짓으로 재지는 것이어야 한다.",
  "- `src/lib/dot` 안만 손댄다. 화면(`src/app/dot`)은 이번엔 못 건드린다.",
  "- **손님에게 보이는 앱이다.** 잘못 고치면 손님이 본다. 그래서 `위험` 칸에 그 지점을 적어라.",
  "- 네가 고른 것이 그대로 실행된다. **하고 싶은 말이 아니라 할 수 있는 일**을 골라라.",
  "- **이미 있는 것을 만들자고 하지 마라.** 아래 파일 설명을 먼저 읽어라 — 09-28 첫 판에 '말풍선 3개 제한' 을 골랐는데 그건 이미 있었다.",
].join("\n");

const input = [
  "## 두근도트 코드 (src/lib/dot) — 머리 주석과 내보내는 것", 속목록("src/lib/dot"), "",
  "## 두근도트 화면 (src/app/dot — 이번엔 못 고친다, 참고용)", 목록("src/app/dot"), "",
  "## 최근 두근도트 관련 커밋", 커밋, "",
  "## 지금 있는 두근도트 자(시험 도구)", 자들,
].join("\n");

const { output, model } = await defaultProviders().ai.generateStructuredOutput({
  systemInstructions: SYS, input, schema, schemaName: "dot_fix_proposal", maxTokens: 16000, tier: "judgment",
});

console.log(`로키가 고른 것 (${model})\n`);
console.log(`고칠 것: ${output.고칠것}`);
console.log(`재는 자: ${output.재는자}`);
console.log(`왜:      ${output.왜}`);
console.log(`손댈 파일: ${output.손댈파일.join(" · ")}`);
console.log(`위험:    ${output.위험}`);
const 밖 = output.손댈파일.filter((f) => !f.startsWith("src/lib/dot"));
if (밖.length) console.log(`\n! 범위 밖 파일을 골랐다: ${밖.join(" ")} — self_fix 가 거부한다`);
console.log(
  `\n다음 한 걸음:\nnpx tsx engine/tools/rookery_env.mts engine/tools/self_fix.mts --ask ${JSON.stringify(output.고칠것)} --ruler ${JSON.stringify(output.재는자)}`,
);
