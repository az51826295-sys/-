/** reap v2 가 실제로 고아를 안 남기나 — 열고 닫은 뒤 rk-hl- 프로세스를 센다. */
const { openHeadless } = await import("../../src/lib/video/headless");
const { execSync } = await import("node:child_process");
const count = () => Number(execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name='msedge.exe'\\" | Where-Object { $_.CommandLine -match 'rk-hl-' }).Count"`, { encoding: "utf8" }).trim() || "0");
const before = count();
const hl = await openHeadless({ width: 640, height: 360 });
if (!hl) { console.log("브라우저 없음"); process.exit(1); }
const page = await hl.browser.newPage(); await page.setContent("<html><body>x</body></html>");
const during = count();
await hl.close();
await new Promise((r) => setTimeout(r, 3000));
const after = count();
console.log(`고아: 열기 전 ${before} · 열린 동안 ${during} · 닫고 3초 뒤 ${after}`);
console.log(after <= before ? "맞음  닫으면 남지 않는다" : "어긋남 닫아도 남는다");
process.exit(after <= before ? 0 : 1);
