/**
 * # 광고를 켜는 **마지막 한 판**  (11-10)
 *
 *   npx tsx engine/tools/dot_ad_open.mts            ← 지금 어디까지 됐나
 *   npx tsx engine/tools/dot_ad_open.mts ca-pub-…   ← 이 번호를 넣으면 무엇이 켜지나(넣기 전 점검)
 *
 * 광고주 번호가 오면 **1분 안에** 끝나도록 순서를 미리 적어 둔 자리다. 사람이 기억해서
 * 하는 일을 하나도 안 남긴다 — 번호 하나만 받으면 나머지는 이 목록대로다.
 *
 * ## 켜지는 조건 (둘 다)
 *
 *   `ADSENSE_CLIENT=ca-pub-…`  · `AD_REWARD_OPEN=1`
 *
 * 하나만 켜면 **광고 없이 하트가 차는 단추**가 생긴다(11-06 까지 실제로 그랬다). 그래서
 * `adConfFromEnv()` 가 둘 다 본다. 이 도구도 둘을 따로 센다.
 */
import { execFileSync } from "node:child_process";

const 번호 = process.argv.find((a) => a.startsWith("ca-pub-"));
const 집 = "https://dot-web-production-7e03.up.railway.app";

/** railway 를 어디서 불려도 찾는다(11-10 에 사장님 터미널엔 없었다 — [[railway-vars-only-via-console]]). */
const 레일 = (() => {
  const 후보 = [`${process.env.APPDATA ?? ""}\\npm\\railway.cmd`];
  for (const p of 후보) { try { execFileSync("cmd", ["/c", p, "--version"], { stdio: "ignore" }); return p; } catch { /* 다음 */ } }
  return "railway";
})();

let 변수: Record<string, string> = {};
try {
  변수 = JSON.parse(execFileSync("cmd", ["/c", 레일, "variables", "--service", "dot-web", "--json"], { encoding: "utf8", maxBuffer: 1 << 24 }));
} catch (e) { console.log(`(railway 를 못 읽었다: ${e instanceof Error ? e.message.split("\n")[0] : e})`); }

const 켜짐 = {
  번호: /^ca-pub-\d{10,22}$/.test((변수.ADSENSE_CLIENT ?? "").trim()),
  스위치: 변수.AD_REWARD_OPEN === "1",
  시험모드: 변수.ADSENSE_TEST === "1",
};
console.log("# 지금 상태\n");
console.log(`  ADSENSE_CLIENT  ${켜짐.번호 ? "✅ 들어 있다" : "🔴 없다 — 형 계정에서 받아야 한다"}`);
console.log(`  AD_REWARD_OPEN  ${켜짐.스위치 ? "✅ 1" : "🔴 꺼짐"}`);
console.log(`  ADSENSE_TEST    ${켜짐.시험모드 ? "⚠ 1 (가짜 광고)" : "— (진짜 광고)"}`);

const r = await fetch(`${집}/ads.txt`, { redirect: "manual", cache: "no-store" as any });
const 글 = r.status === 200 ? (await r.text()).trim() : "";
console.log(`  /ads.txt        ${r.status === 200 ? `✅ ${글}` : `🔴 ${r.status} (번호가 들어가면 200 이 된다)`}`);

/* 상태를 말하는 자는 **문을 직접 불러야 한다** — 안 부르고 적으면 거짓 보고가 된다
   ([[reporting-tool-must-call-the-gate]]). 심사가 보는 쪽은 `dot_ad_ready` 가 센다. */
console.log("\n# 심사가 와서 볼 것 (dot_ad_ready)\n");
try {
  const 말 = execFileSync("cmd", ["/c", "npx", "tsx", "engine/tools/dot_ad_ready.mts", 집], { encoding: "utf8", maxBuffer: 1 << 24 });
  console.log(`  ${말.trim().split("\n").filter((l) => /맞음$|틀림/.test(l)).slice(-3).join("\n  ")}`);
} catch (e) {
  const 말 = (e as { stdout?: string }).stdout ?? "";
  const 요약 = 말.split("\n").filter((l) => /\d+\/\d+ 맞음|^  · /.test(l));
  console.log(요약.length ? `  ${요약.join("\n  ")}` : "  (자를 못 돌렸다)");
}

console.log("\n# 번호가 오면 이 순서로\n");
const 줄 = [
  ["1", "Railway 콘솔 → dot-web → Variables 에 두 줄", `ADSENSE_CLIENT=${번호 ?? "ca-pub-…"}\n     AD_REWARD_OPEN=1`],
  ["2", "배포가 끝나면 ads.txt 가 200 인지", "npx tsx engine/work/probe/dot_adstxt_live.mts"],
  ["3", "광고 줄이 **뜨는지** (운영, 진짜 계정)", "node engine/work/ui-audit/peek_make.mjs → npx tsx engine/tools/dot_ad_show_test.mts <링크>"],
  ["4", "충전 길이 막혀 있지 않은지", "npx tsx engine/tools/dot_ad_route_test.mts"],
  ["5", "하루 상한이 도는지(5번)", "npx tsx engine/tools/dot_ad_test.mts"],
];
for (const [n, 무엇, 어떻게] of 줄) console.log(`  ${n}. ${무엇}\n     ${어떻게}\n`);

console.log("# 남은 하나 — 사람 손이 필요한 곳\n");
console.log("  AdSense 계정은 **만 18세·본인 확인**이라 내가 못 만든다. 번호(ca-pub-…) 하나만 받으면");
console.log("  위 1번부터는 내가 한다(콘솔은 브라우저로 들어간다 — 11-10 에 일꾼 DB 를 그렇게 바꿨다).");
console.log("  안내문: engine/docs/dot-adsense-brief.md");
process.exit(켜짐.번호 && 켜짐.스위치 ? 0 : 1);
