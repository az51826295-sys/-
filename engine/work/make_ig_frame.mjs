// 인스타용 4:5(1080x1350) — 이미 찍은 영어 첫 화면(dot-promo-en.png)을 연보라 바탕 가운데에 놓기만 한다(새 그림·새 글 없음).
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
const src = "data:image/png;base64," + readFileSync(process.argv[2] ?? "dot-promo-en.png").toString("base64");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1080, height: 1350 });
await p.setContent(`<body style="margin:0;width:1080px;height:1350px;background:#f0edff;display:flex;align-items:center;justify-content:center">
<img src="${src}" style="height:1250px;border-radius:36px;box-shadow:0 12px 40px rgba(60,40,140,.25)"></body>`, { waitUntil: "load" });
await p.screenshot({ path: process.argv[3] ?? "dot-promo-ig.jpg", type: "jpeg", quality: 92 });
await b.close();
console.log("ok");
