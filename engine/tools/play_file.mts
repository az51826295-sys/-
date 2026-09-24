/** 고리가 쓰는 길(runWeb) 그대로 한 파일을 돌려 게임·점프 자를 읽는다. play_file <html 경로>... */
const { runWeb } = await import("../../src/lib/skills/appBuild/run");
const { readFileSync } = await import("node:fs");
for (const p of process.argv.slice(2).filter((a) => a.endsWith(".html"))) {
  const t0 = Date.now();
  const f = await runWeb([{ path: "index.html", contents: readFileSync(p, "utf8"), language: "html" }], { mobile: false, measures: ["게임", "점프"] });
  console.log(p, `(${Math.round((Date.now() - t0) / 1000)}초)`, "ran", f.ran, "· 오류", f.consoleErrors?.length ?? 0, "\n  measured:", JSON.stringify((f as { measured?: unknown }).measured));
}
