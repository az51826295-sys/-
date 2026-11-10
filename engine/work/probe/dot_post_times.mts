/** 오늘 각 캐릭터가 몇 시에 올리나 — "새 글이 안 온다"를 재기 전에 **올 시각**부터 본다. */
import { postMinute } from "../../../src/lib/dot/posts.js";
import { todayKST } from "../../../src/lib/dot/bond.js";
const 사람 = ["doyun","haru","jiwoo","nabi","rin","seoha","soeun","taeo","yeonu","yuna"];
const day = todayKST();
const k = new Date(Date.now() + 9 * 3_600_000);
const now = k.getUTCHours() * 60 + k.getUTCMinutes();
const 표 = 사람.map((s) => ({ s, m: postMinute(s, day) })).sort((a, b) => a.m - b.m);
const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
console.log(`오늘 ${day} · 지금 ${hh(now)} (KST)`);
for (const r of 표) console.log(`  ${hh(r.m)}  ${r.s}${r.m <= now ? "  ← 이미 지남" : ""}`);
const 다음 = 표.find((r) => r.m > now);
console.log(다음 ? `\n다음 글: ${hh(다음.m)} ${다음.s} (${다음.m - now}분 뒤)` : "\n오늘 남은 글 없음");
