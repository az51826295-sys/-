// X 프로필 그림 두 장: 프로필 사진(400×400, 유나 웃는 얼굴) · 배너(1500×500, 캐릭터 줄 + 한 줄 소개).
// 그림은 사이트에 이미 있는 캐릭터 그림만 쓴다(새로 그리지 않는다).
import puppeteer from "puppeteer-core";
const BASE = "https://dot-web-production-7e03.up.railway.app";
const out = process.argv[2] ?? ".";
const chars = (await (await fetch(BASE + "/api/dot/characters")).json()).characters;
const pick = ["yuna", "seoha", "rin", "doyun", "nabi", "haru", "yeonu", "taeo"].map((s) => chars.find((c) => c.slug === s)).filter(Boolean);
const face = (c) => c.sprites.happy ?? c.sprites.neutral;
const name = (s) => s[0].toUpperCase() + s.slice(1);

const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();

await p.setViewport({ width: 400, height: 400 });
await p.setContent(`<html><body style="margin:0;width:400px;height:400px;background:#f0edff;display:flex;align-items:center;justify-content:center">
<img src="${face(pick[0])}" style="width:340px;height:340px;image-rendering:pixelated;object-fit:contain"></body></html>`, { waitUntil: "load", timeout: 90000 });
await p.screenshot({ path: `${out}/x-avatar.png` });

await p.setViewport({ width: 1500, height: 500 });
await p.setContent(`<html><head></head>
<body style="margin:0;width:1500px;height:500px;background:linear-gradient(#2a2140,#1b1430);font-family:Consolas,monospace;font-weight:700;color:#fff;overflow:hidden">
<div style="position:absolute;left:0;right:0;top:40px;text-align:center;font-size:64px;letter-spacing:2px">Dot</div>
<div style="position:absolute;left:0;right:0;top:125px;text-align:center;font-size:26px;color:#cfc6ff">chat with pixel characters, like texting a friend</div>
<div style="position:absolute;left:0;right:0;bottom:115px;display:flex;justify-content:center;gap:26px">
${pick.map((c) => `<div style="text-align:center"><img src="${face(c)}" style="width:130px;height:130px;image-rendering:pixelated;object-fit:contain;background:#3a2f5c;border-radius:20px"><div style="font-size:18px;margin-top:8px;color:#e8e3ff">${name(c.slug)}</div></div>`).join("")}
</div></body></html>`, { waitUntil: "load", timeout: 90000 });
await p.screenshot({ path: `${out}/x-header.png` });
await b.close();
console.log("ok", pick.length);
