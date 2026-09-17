/**
 * 메뉴 분산 자 (95회차 09-13) — 사장님 "여기(방 메뉴)에 몰아놓지 말고 분산시켜". 모델 없음, 파일만 읽는다(+실서버 한 번).
 *   (1) 방 메뉴 항목 ≤ 6, 전부 "이 방" 것(알림·멘헤라·배경·대화 지우기·신고·도움말)
 *   (2) 방 메뉴에 아래 탭·뒤로 가기와 같은 목적지(채팅 목록·피드) 없음 — 같은 목적지 단추 둘은 93회차 교훈
 *   (3) 방 메뉴에 계정·약관·계정 삭제 없음, 설정 페이지에는 있음(로그아웃·계정 삭제·개인정보·아동 안전)
 *   (4) 친구 탭에 설정 링크 있음 · 계정 삭제 안내문이 설정을 가리킴
 *   (5) 실서버 /dot/settings 는 로그인 없이는 로그인 화면으로(302→/login)
 *   npx node engine/tools/dot_menu_test.mjs
 */
import { readFileSync } from "node:fs";
const r = (p) => readFileSync(p, "utf8");
const chat = r("src/app/dot/[slug]/DotChat.tsx");
const menu0 = chat.slice(chat.indexOf('<div className="kk-menu">'), chat.indexOf("</div>", chat.indexOf('<div className="kk-menu">')));
// 주석은 항목이 아니다 — {/* … */} 를 걷어내고 잰다.
const menu = menu0.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const items = (menu.match(/<(button|a)\b[^>]*>/g) ?? []).length;
const settings = r("src/app/dot/settings/page.tsx") + r("src/app/dot/settings/SettingsActions.tsx");
const pick = r("src/app/dot/pick/page.tsx");
const del = r("src/app/dot/delete-account/page.tsx");
const lines = [];
lines.push([items <= 6, `방 메뉴 항목 ${items}개 (≤6)`]);
const roomOnly = ["알림", "멘헤라", "배경", "대화 내용 지우기", "신고", "도움말"].filter((k) => menu.includes(k)).length;
lines.push([roomOnly === 6, `이 방 항목 ${roomOnly}/6 남음`]);
const dup = ["/dot/chats", "/dot/feed"].filter((h) => menu.includes(h));
lines.push([dup.length === 0, `탭·뒤로 가기와 같은 목적지 ${dup.length}개 ${dup.join(",")}`]);
const moved = ["계정 삭제", "/dot/privacy", "account.email", "계정 연결"].filter((k) => menu.includes(k));
lines.push([moved.length === 0, `방 메뉴에 남은 계정·약관 ${moved.length}개 ${moved.join(",")}`]);
const inSettings = ["로그아웃", "계정 삭제", "/dot/privacy", "/dot/child-safety"].filter((k) => settings.includes(k)).length;
lines.push([inSettings === 4, `설정 페이지 항목 ${inSettings}/4`]);
lines.push([pick.includes('href="/dot/settings"'), `친구 탭 → 설정 링크 ${pick.includes('href="/dot/settings"') ? "있음" : "없음"}`]);
lines.push([del.includes("설정") && !del.includes("≡"), `계정 삭제 안내문이 설정을 가리킴: ${del.includes("설정") && !del.includes("≡")}`]);
const base = process.argv[2] ?? "https://dot-web-production-7e03.up.railway.app";
try {
  const res = await fetch(`${base}/dot/settings`, { redirect: "manual" });
  const loc = res.headers.get("location") ?? "";
  lines.push([[302, 307].includes(res.status) && loc.includes("/login"), `실서버 /dot/settings 로그인 없이 → ${res.status} ${loc.replace(base, "")}`]);
} catch (e) { lines.push([false, `실서버 못 닿음: ${e.message}`]); }
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
