/**
 * 잿빛에 **의견 보내기**를 붙인다 (10-26).
 *
 * 까닭: 프로덕션 신청이 반려돼 14일을 다시 채운다. 지난 신청에서 제일 약했던 칸이
 * "테스터 의견이 많지 않았다" 였다 — 사실이라 그대로 썼지만, 2주가 생겼으니 이번엔
 * **진짜 답을 만든다.** 게임 안에서 한 줄 쓰고 보내면 로키 장부에 쌓인다.
 *
 * 짝이 **딱 한 번** 나오는지 세고, 하나라도 안 맞으면 아무것도 안 쓴다.
 */
import { readFileSync, writeFileSync } from "node:fs";

const 경로 = "C:/Users/az518/Desktop/ai-workforce/public/ash/index.html";
let s = readFileSync(경로, "utf8");

const 새말 = {
  "set.feedback": { ko: "의견 보내기", en: "Send feedback" },
  "fb.title": { ko: "의견 보내기", en: "Send feedback" },
  "fb.hint": { ko: "좋았던 것, 불편한 것, 막힌 곳 — 한 줄이라도 좋아요. 만든 사람이 직접 읽어요.", en: "What you liked, what annoyed you, where you got stuck — even one line helps. The developer reads these." },
  "fb.send": { ko: "보내기", en: "Send" },
  "fb.thanks": { ko: "고마워요. 잘 받았어요.", en: "Thank you — got it." },
  "fb.failed": { ko: "못 보냈어요. 잠시 뒤 다시 해 주세요.", en: "Could not send. Please try again in a moment." },
  "fb.empty": { ko: "한 줄만 적어 주세요.", en: "Please write something first." },
};

const 짝 = [
  /* ① 설정 창에 단추 한 줄 */
  [`   <div class="줄"><button class="btn" id="지우기단추">\${말("set.wipe")}</button></div>\``,
   `   <div class="줄"><button class="btn" id="의견단추">\${말("set.feedback")}</button></div>
   <div class="줄"><button class="btn" id="지우기단추">\${말("set.wipe")}</button></div>\``],

  /* ② 그 단추가 하는 일 — 지우기 처리 바로 앞에 끼운다 */
  [`    덮.querySelector("#지우기단추").onclick = () => {`,
   `    /* 10-26: 의견 한 줄. **보내고 나면 창을 닫는다** — 보냈는지 모르면 또 보낸다. */
    덮.querySelector("#의견단추").onclick = () => {
      덮.remove();
      쪽창(말("fb.title"),
        \`<div class="풀이 on">\${말("fb.hint")}</div>
         <div class="줄"><textarea id="의견글" rows="4" style="width:100%;box-sizing:border-box"></textarea></div>
         <div class="줄"><button class="btn" id="의견보내기">\${말("fb.send")}</button></div>
         <div class="풀이" id="의견말"></div>\`,
        (덮3) => {
          const 글칸 = 덮3.querySelector("#의견글"), 말칸 = 덮3.querySelector("#의견말"), 단추 = 덮3.querySelector("#의견보내기");
          글칸.focus();
          단추.onclick = async () => {
            const 글 = (글칸.value || "").trim();
            if (!글) { 말칸.className = "풀이 on"; 말칸.textContent = 말("fb.empty"); return; }
            단추.disabled = true;
            try {
              const r = await fetch("/api/ash/feedback", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ 글, 층: S.층, 최고층: S.최고층, 말: 쓰는말 }),
              });
              if (!r.ok) throw new Error(String(r.status));
              말칸.className = "풀이 on"; 말칸.textContent = 말("fb.thanks");
              setTimeout(() => 덮3.remove(), 1200);
            } catch {
              말칸.className = "풀이 on"; 말칸.textContent = 말("fb.failed");
              단추.disabled = false;
            }
          };
        });
    };
    덮.querySelector("#지우기단추").onclick = () => {`],
];

const 탈 = [];
for (const [옛] of 짝) { const n = s.split(옛).length - 1; if (n !== 1) 탈.push(n + "번  " + 옛.trim().slice(0, 60)); }
if (탈.length) { console.log("**안 쓴다** — 짝이 안 맞았다:"); 탈.forEach((t) => console.log("  " + t)); process.exit(1); }
for (const [옛, 새] of 짝) s = s.replace(옛, 새);

/* 말표에 넣기 */
const 머리 = s.match(/^const 말표 = \{/m);
let i = 머리.index + 머리[0].length - 1, depth = 0;
while (i < s.length) {
  const c = s[i];
  if (c === '"' || c === "'" || c === "`") { const q = c; i++; while (i < s.length && s[i] !== q) { if (s[i] === "\\") i++; i++; } }
  else if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; }
  else if (c === "/" && s[i + 1] === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i++; }
  else if (c === "{") depth++;
  else if (c === "}") { depth--; if (depth === 0) break; }
  i++;
}
const 표본문 = s.slice(0, i);
const 넣을것 = Object.entries(새말).filter(([k]) => !표본문.includes(JSON.stringify(k) + ":"));
const 줄 = ["", "  /* ── 의견 보내기 (10-26) ── */"];
for (const [k, v] of 넣을것) 줄.push("  " + JSON.stringify(k) + ": { ko: " + JSON.stringify(v.ko) + ", en: " + JSON.stringify(v.en) + " },");
s = s.slice(0, i) + 줄.join("\n") + "\n" + s.slice(i);

writeFileSync(경로, s, "utf8");
console.log("의견 보내기 붙였다 · 말표에 " + 넣을것.length + "줄");
