/**
 * **제안한 자를 시험지에 댄다** (판 7).
 * 개발용: 판 1·2·4·5·6 + 원본. **봉인한 판 3 은 `--sealed` 를 줘야만 쓴다 — 한 번 쓰면 소모된다.**
 */
const { openHeadless } = await import("../../src/lib/video/headless");
const { measureJump, checkGuards } = await import("../../src/lib/skills/appBuild/webMeasures");
const { readFileSync } = await import("node:fs");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const p = JSON.parse(readFileSync(arg("--proposal")!, "utf8")) as { 난간: any[]; 안내값: any[] };
const 개발용: [string, string][] = [
  ["원본", "engine/work/candidate-na/index.html"],   // 판 9 부터 (나): 발판 되돌림 + 큰 제목 (09-24)
  ["판1", "engine/work/stage4-run1/round1/index.html"],
  ["판2", "engine/work/stage4-run2/round1/index.html"],
  ["판4", "engine/work/stage4-run4/round1/index.html"],
  ["판5", "engine/work/stage4-run5/round1/index.html"],
  ["판6", "engine/work/stage4-run6/round1/index.html"],
  // 판 3 은 판 7 에서 봉인으로 소모됐고, 판 7 은 사장님이 "높이가 높아서 클리어가 안돼" 라고
  // 하셨으므로 둘 다 이제 **개발용**이다(09-22 저녁).
  ["판3", "engine/work/stage4-run3/round1/index.html"],
  ["판7", "engine/work/stage4-run7/round1/index.html"],
];
// **봉인 없음**(09-22 저녁): 판 3 소모 · 판 4 흔들림 · 판 6 오염 · 판 7 풀림.
const 장 = 개발용;

const hl = await openHeadless({ width: 1280, height: 720 });
if (!hl) process.exit(1);
let bad = 0;
try {
  for (const [name, path] of 장) {
    const page = await hl.browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (r) => { const u = r.url(); if (u.startsWith("data:") || u === "about:blank") void r.continue(); else void r.abort(); });
    await page.setContent(readFileSync(path, "utf8"), { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 600));
    const m = await measureJump(page);
    await page.close();
    const 난간걸림 = checkGuards(m ?? undefined, p.난간);
    const 안내걸림 = checkGuards(m ?? undefined, p.안내값);
    if (name === "원본") {
      // 원본은 **난간에 안 걸려야** 한다. 안내값에는 걸려야 한다(바꿀 대상이니까).
      const ok1 = 난간걸림.length === 0, ok2 = 안내걸림.length > 0;
      if (!ok1 || !ok2) bad++;
      console.log(`${ok1 && ok2 ? "맞음 " : "어긋남"} 원본 — 난간 ${난간걸림.length}개(0이어야) · 안내값 ${안내걸림.length}개(1개 이상이어야)`);
      if (난간걸림.length) console.log(`        ${난간걸림.join(" / ")}`);
    } else {
      // **난간에 걸린 것과 안내값에 걸린 것을 갈라 적는다.** checkGuards 의 말머리는 둘 다 "난간 어김" 이라
      // 합쳐 놓으면 안내값에만 걸린 장이 난간에 걸린 것처럼 읽힌다(09-22 에 실제로 그렇게 찍혔다).
      const 어디 = 난간걸림.length ? "난간" : 안내걸림.length ? "안내값" : null;
      if (!어디) bad++;
      const 첫 = (난간걸림[0] ?? 안내걸림[0] ?? "").replace("난간 어김: ", "").split(" (")[0];
      console.log(`${어디 ? "맞음 " : "어긋남"} ${name} — ${어디 ? `**${어디}**에 걸림 · ${첫}` : "**안 걸렸다**"}`);
    }
  }
} finally { await hl.close(); }
console.log(`\n${bad ? `**어긋남 ${bad}장**` : "**전부 맞음**"}`);
process.exit(bad ? 1 : 0);
