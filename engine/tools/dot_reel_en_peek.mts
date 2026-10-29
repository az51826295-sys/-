/** 영어 화면에 **남은 한글**을 줄 단위로 집어 온다 (10-29). 값 0 · 모델 0. */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { 이름헬퍼 } from "./ash_공통.mjs";
const BASE = "https://dot-web-production-7e03.up.railway.app";
const 길 = process.argv[2] ?? "/dot/doyun";
const profile = mkdtempSync(join(tmpdir(), "dot-en-"));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true, userDataDir: profile,
  args: ["--no-first-run", "--lang=en-US"],
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});
try {
  const page = await browser.newPage();
  await 이름헬퍼(page);   // tsx 가 넣는 __name 이 페이지에 없어서 evaluate 가 터진다
  await page.setCookie({ name: "dot_lang", value: "en", domain: new URL(BASE).hostname, path: "/" });
  await page.goto(BASE + 길, { waitUntil: "networkidle2", timeout: 90_000 });
  await new Promise((r) => setTimeout(r, 4500));
  const 본 = await page.evaluate(() => {
    const 한글 = (s: string) => (s.match(/[\uac00-\ud7a3]/g) ?? []).length;
    /* 어느 **칸**에 한글이 있나 — 글만 보면 어디를 고쳐야 할지 모른다. */
    const 걸린것: string[] = [];
    for (const e of [...document.querySelectorAll("body *")]) {
      if (e.children.length) continue;                       // 잎만
      const t = (e.textContent ?? "").trim();
      if (!t || !한글(t)) continue;
      const el = e as HTMLElement;
      const 보임 = !!el.offsetParent || getComputedStyle(el).position === "fixed";
      걸린것.push(`${보임 ? "보임" : "숨음"} <${e.tagName.toLowerCase()} class="${(e.className || "").toString().slice(0, 40)}"> ${t.slice(0, 60)}`);
    }
    return { 한글: 한글(document.body.innerText ?? ""), 걸린것: 걸린것.slice(0, 25) };
  });
  console.log(`body 한글 ${본.한글}자`);
  for (const l of 본.걸린것) console.log("  " + l);
} finally { await browser.close(); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
