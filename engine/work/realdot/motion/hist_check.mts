// 11-27 기록이 새로고침 뒤에도 남나(배포된 사이트, 돈 0) — 헤드리스 새 프로필: 기록 한 칸을 IndexedDB 에 넣고 새로고침 → 기록 줄에 보이나,
// 그리고 사이트가 그 칸을 다시 담는지(덮어쓰지 않는지) 읽어 본다. 사진 한 장을 남긴다.
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const prof = mkdtempSync(join(tmpdir(), "pxh-"));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, userDataDir: prof, args: ["--no-first-run"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto("https://dugeundot.com/pixel", { waitUntil: "networkidle2" });
  const dot = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR42mP8z8Dwn4EIwDiqkL4KAQCYtgP9wL2jvQAAAABJRU5ErkJggg==";
  await page.evaluate(async (dot) => {
    await new Promise<void>((res, rej) => { const r = indexedDB.open("px-hist", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => { const tx = r.result.transaction("kv", "readwrite"); tx.objectStore("kv").put([{ id: 5, kind: "create", title: "기록 시험", view: dot, info: "4×4", downloads: [{ href: dot, name: "t.png", label: "PNG" }], refable: dot }], "items"); tx.oncomplete = () => res(); }; r.onerror = () => rej(r.error); });
  }, dot);
  await page.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));
  const shown = await page.$$eval(".px-hist .strip button small", (xs) => xs.map((x) => x.textContent));
  const label = await page.$eval(".px-hist .lab", (x) => x.textContent);
  const stored = await page.evaluate(() => new Promise<number>((res) => { const r = indexedDB.open("px-hist", 1); r.onsuccess = () => { const q = r.result.transaction("kv").objectStore("kv").get("items"); q.onsuccess = () => res(Array.isArray(q.result) ? q.result.length : -1); }; }));
  await (await page.$(".px-hist"))?.screenshot({ path: "C:/Users/az518/Desktop/두근도트-스레드/rival/hist-check.png" });
  console.log(`기록 줄: ${JSON.stringify(shown)} · 안내: ${label} · 새로고침 뒤 기기에 남은 칸 ${stored}`);
} finally { await browser.close(); rmSync(prof, { recursive: true, force: true }); }
