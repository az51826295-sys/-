/**
 * # 일꾼을 **앱이 보는 DB** 로 돌린다 (11-09)
 *
 *   npx tsx engine/tools/dot_worker_point_at_app_db.mts        ← 보기만
 *   npx tsx engine/tools/dot_worker_point_at_app_db.mts --set  ← 실제로 바꾼다(일꾼이 다시 뜬다)
 *
 * ## 무슨 일이 있었나
 *
 * 사장님: *"게시물이 다양하지 않아."* 세어 보니 **앱 쪽 피드는 10-17 에 멈춰** 있었다.
 * 그런데 일꾼 로그에는 오늘도 글을 올린 기록이 있다. 둘 다 사실이었다 —
 * **일꾼과 웹이 서로 다른 Supabase 를 보고 있었다.**
 *
 * | | 보는 DB | 마지막 게시물 | 마지막 대화 |
 * |---|---|---|---|
 * | dot-web (사람이 쓰는 쪽) | wroysw… | 2026-10-17 | 2026-11-04 |
 * | dot-worker (글 쓰는 쪽) | iohfy…(옛집) | 2026-11-08 | 2026-10-06 |
 *
 * 이사(제 조직으로) 때 웹만 새 집으로 옮기고 **일꾼은 옛집에 남았다.** 그 뒤로 일꾼이 쓴
 * 게시물 71개는 아무도 못 보는 DB 에 쌓였다. 피드가 다양하지 않은 첫째 까닭은 글재주가 아니라
 * **23일째 새 글이 안 들어온 것**이다([[green-deploy-wrong-service]] 와 같은 자리).
 *
 * 값은 **찍지 않는다** — dot-web 에서 읽어 dot-worker 에 그대로 넣기만 한다.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * railway 를 **어디서 불려도** 찾는다.
 *
 * 11-09: 사장님 터미널에서 세 번 `'railway' 는 ... 명령이 아닙니다` 로 죽었다. 제 쪽 PATH 에는
 * 있어서 저는 멀쩡했다 — **내 환경에서 되는 것은 사장님 환경에서 된 것이 아니다.**
 * npm 전역 폴더(`%APPDATA%\npm`)를 먼저 보고, 없으면 PATH 에 맡긴다.
 */
const 레일 = (() => {
  const 후보 = [`${process.env.APPDATA ?? ""}\\npm\\railway.cmd`, `${process.env.ProgramFiles ?? ""}\\Railway\\railway.exe`];
  return 후보.find((p) => p && existsSync(p)) ?? "railway";
})();

const 변수 = (서비스: string): Record<string, string> =>
  JSON.parse(execFileSync("cmd", ["/c", 레일, "variables", "--service", 서비스, "--json"], { encoding: "utf8", maxBuffer: 1 << 24 }));

const 옮길칸 = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY"];
const web = 변수("dot-web"), worker = 변수("dot-worker");
const ref = (u?: string) => (u ?? "").replace("https://", "").split(".")[0] || "없음";
console.log(`웹   ${ref(web.NEXT_PUBLIC_SUPABASE_URL)}\n일꾼 ${ref(worker.NEXT_PUBLIC_SUPABASE_URL)}`);

const 바꿀것 = 옮길칸.filter((k) => web[k] && web[k] !== worker[k]);
if (!바꿀것.length) { console.log("\n이미 같다 — 바꿀 것 없다"); process.exit(0); }
console.log(`\n바꿀 칸 ${바꿀것.length}개: ${바꿀것.join(", ")}`);
if (!process.argv.includes("--set")) { console.log("보기만 했다. 바꾸려면 --set"); process.exit(0); }

/* 한 번에 넣는다 — 칸마다 따로 넣으면 그때마다 일꾼이 다시 뜬다. */
const 인자 = ["/c", 레일, "variables", "--service", "dot-worker"];
for (const k of 바꿀것) { 인자.push("--set", `${k}=${web[k]}`); }
execFileSync("cmd", 인자, { stdio: "inherit" });

const 후 = 변수("dot-worker");
const 남은것 = 옮길칸.filter((k) => web[k] !== 후[k]);
console.log(남은것.length ? `\n틀림  아직 다른 칸: ${남은것.join(", ")}` : `\n맞음  일꾼이 이제 ${ref(후.NEXT_PUBLIC_SUPABASE_URL)} 를 본다 (웹과 같다)`);
