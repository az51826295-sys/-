/**
 * 두근도트 새 집(dugeun-dot-2)이 **옛 집만큼 갖춰졌나** (10-24).
 *
 * 이사는 자료만 옮긴다. 안 따라오는 것이 셋 있고, 오늘 그중 하나(구글 provider)가
 * 사장님 폰에서 생 JSON 으로 터졌다. 나머지 둘도 **터지기 전에** 여기서 잰다:
 *   ① 보안 규칙(RLS) — 없으면 **남의 대화가 다 보인다.** 695줄을 복원하기 **전에** 재야 한다
 *   ② 돌아올 주소(redirect) — 없으면 구글을 켜도 로그인이 안 끝난다
 *   ③ 켜진 로그인 방법
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const 뿌리 = "C:/Users/az518/Desktop/ai-workforce";
const k = JSON.parse(readFileSync(뿌리 + "/.keys/dot-new.json", "utf8"));

/** 손님(anon)으로 들어가 본다 — 로그인 안 한 사람이 무엇을 볼 수 있나 */
const 손님 = createClient(k.url, k.anon, { auth: { persistSession: false } });
const 주인 = createClient(k.url, k.service, { auth: { persistSession: false } });

console.log("── ① 보안 규칙(RLS) — 로그인 안 한 사람이 보는 것");
const 봐야막힘 = ["dot_messages", "dot_bonds", "dot_turns", "dot_usage", "dot_wallet", "dot_purchases", "dot_entitlements", "dot_push_subs"];
const 봐도됨 = ["dot_characters", "dot_posts"];
let 구멍 = 0;
for (const t of [...봐야막힘, ...봐도됨]) {
  const 손 = await 손님.from(t).select("*").limit(3);
  const 주 = await 주인.from(t).select("*", { count: "exact", head: true });
  const 막혀야 = 봐야막힘.includes(t);
  const 보임 = !손.error && (손.data?.length ?? 0) > 0;
  const 전체 = 주.count ?? 0;
  let 판정;
  if (막혀야 && 보임) { 판정 = "**구멍** 남의 것이 보인다"; 구멍++; }
  else if (막혀야) 판정 = 손.error ? "막힘(" + (손.error.code ?? "거절") + ")" : (전체 === 0 ? "줄이 0이라 못 잼" : "막힘(빈 결과)");
  else 판정 = 보임 ? "보임(맞다)" : (전체 === 0 ? "줄이 0이라 못 잼" : "**안 보인다** — 화면이 빌 수 있다");
  console.log("   " + t.padEnd(20) + String(전체).padStart(5) + "줄  " + 판정);
}

console.log("\n── ② 로그인 설정");
const s = await fetch(k.url + "/auth/v1/settings", { headers: { apikey: k.anon } }).then((r) => r.json());
console.log("   켜진 제공자: " + (Object.entries(s.external ?? {}).filter(([, v]) => v).map(([x]) => x).join(", ") || "(없음)"));
console.log("   이메일 가입 허용: " + (s.disable_signup === false));
console.log("   구글: " + (s.external?.google ? "켜짐" : "**꺼짐** ← 오늘 사장님이 본 생 JSON 의 원인"));

console.log("\n── ③ 앱이 쓰는 주소");
console.log("   새 프로젝트: " + k.url);
console.log("   구글 클라우드에 이 주소가 등록돼 있어야 한다:");
console.log("     " + k.url + "/auth/v1/callback");

console.log("\n   보안 구멍 " + 구멍 + "개");
