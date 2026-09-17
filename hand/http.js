// 로키 손의 우회 전송로 (160회차 2026-09-17).
//
// Windows 의 TLS 스택(Schannel — PowerShell 5.1·윈도 curl 이 쓴다)이 Railway 엣지와 핸드셰이크를 못 한다(SEC_E_INVALID_TOKEN).
// Node(OpenSSL)는 된다. 그래서 손은 먼저 PowerShell 로 보내 보고, 막히면 Node 가 있을 때 이 파일로 보낸다.
//
//   node http.js <GET|POST> <url> <x-rookery-key> [본문 JSON 파일]
// 응답 본문을 그대로 찍고, 2xx 가 아니면 1 로 끝난다.
const [method, url, key, bodyFile] = process.argv.slice(2);
if (!method || !url || !key) { console.error("쓰는 법: node http.js <GET|POST> <url> <key> [bodyFile]"); process.exit(2); }
const fs = require("node:fs");
const body = bodyFile ? fs.readFileSync(bodyFile, "utf8") : undefined;
fetch(url, {
  method,
  headers: { "x-rookery-key": key, "user-agent": "rookery-hand/1 (node)", ...(body ? { "content-type": "application/json; charset=utf-8" } : {}) },
  body,
  signal: AbortSignal.timeout(300_000),
}).then(async (r) => {
  const text = await r.text();
  process.stdout.write(text);
  process.exit(r.ok ? 0 : 1);
}).catch((e) => { console.error(String(e && e.message ? e.message : e)); process.exit(1); });
