/**
 * 두근도트 그림 주소가 **죽은 옛 프로젝트**를 가리킨다 (10-24).
 * 로컬 `public/dot-sprites/` 에 같은 파일이 있으면 **오늘 살릴 수 있다.** 몇 장인지 센다.
 * 고치지 않는다 — 세기만 한다. 고치는 것은 숫자를 보고 정한다.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const 뿌리 = "C:/Users/az518/Desktop/ai-workforce";
const k = JSON.parse(readFileSync(뿌리 + "/.keys/dot-new.json", "utf8"));
const db = createClient(k.url, k.service, { auth: { persistSession: false } });
const 옛 = "iohfypuwnnayzztkvgvs.supabase.co";

/** 옛 주소에서 버킷 뒤 경로만 뽑는다: .../object/public/dot-sprites/<여기> */
const 경로 = (u) => {
  const m = String(u ?? "").match(/\/object\/public\/dot-sprites\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};
const 로컬에있나 = (p) => p !== null && existsSync(뿌리 + "/public/dot-sprites/" + p);

/** 글 안에 박힌 주소를 전부 훑는다 */
const 훑기 = (v, 모음) => {
  if (typeof v === "string") { if (v.includes(옛)) 모음.push(v); return; }
  if (Array.isArray(v)) { v.forEach((x) => 훑기(x, 모음)); return; }
  if (v && typeof v === "object") { Object.values(v).forEach((x) => 훑기(x, 모음)); }
};

const 볼것 = [
  ["dot_posts", "id, image_url"],
  ["dot_characters", "id, slug, photos, sprites, avatar_url"],
];
let 살릴수있음 = 0, 못살림 = 0;
const 못살린보기 = [];
for (const [표, 칸] of 볼것) {
  const { data, error } = await db.from(표).select(칸);
  if (error) { console.log(표 + ": 오류 " + error.message.slice(0, 70)); continue; }
  const 모음 = [];
  for (const r of data ?? []) 훑기(r, 모음);
  const 고유 = [...new Set(모음)];
  let a = 0, b = 0;
  for (const u of 고유) { if (로컬에있나(경로(u))) a++; else { b++; if (못살린보기.length < 6) 못살린보기.push(경로(u) ?? u.slice(0, 60)); } }
  살릴수있음 += a; 못살림 += b;
  console.log(표.padEnd(16) + " 죽은 주소 " + String(고유.length).padStart(4) + "개 · 로컬에 있음 " + String(a).padStart(4) + " · 없음 " + String(b).padStart(4));
}
console.log("\n오늘 살릴 수 있는 그림 " + 살릴수있음 + "개 · 10-27 을 기다려야 하는 것 " + 못살림 + "개");
if (못살린보기.length) console.log("못 살리는 것 보기: " + 못살린보기.join(" / "));
