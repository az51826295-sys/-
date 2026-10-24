/**
 * 옛 두근도트(iohfyp…) 가 지금 열리나 — 열리면 **사진 156장을 오늘 가져와** 옛 프로젝트를 비우고
 * 로키를 깨울 수 있다. 막혀 있으면 10-27 까지 로키는 못 깬다.
 * 402 는 `error.message` 가 비니 **status 로 가른다**(10-24 에 배운 것).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const 뿌리 = "C:/Users/az518/Desktop/ai-workforce";
const 옛 = JSON.parse(readFileSync(뿌리 + "/.keys/dot-web-옛변수-백업.json", "utf8"));
const url = 옛.NEXT_PUBLIC_SUPABASE_URL;
const anon = 옛.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = 옛.SUPABASE_SECRET_KEY ?? 옛.SUPABASE_SERVICE_ROLE_KEY ?? null;
console.log("옛 주소 " + url.replace(/https:\/\/([a-z]{6}).*/, "$1…"));
console.log("service 열쇠 " + (service ? "있다" : "**없다** — anon 으로만 재 본다"));

/** 1. REST 가 열리나 */
const db = createClient(url, service ?? anon, { auth: { persistSession: false } });
const r = await db.from("dot_posts").select("*", { count: "exact", head: true });
console.log("REST dot_posts  status=" + r.status + "  " + (r.error ? "오류: " + (r.error.message || "(본문 없음)") : "줄 " + r.count));

/** 2. 스토리지가 열리나 — 목록과 파일 하나 */
const s = await db.storage.from("dot-sprites").list("", { limit: 3 });
console.log("Storage 목록    " + (s.error ? "오류: " + (s.error.message || "(본문 없음)") : (s.data ?? []).map((x) => x.name).join(", ") || "(빈 목록)"));

/** 3. 피드 사진 버킷 이름을 찾는다 */
const b = await db.storage.listBuckets();
console.log("버킷            " + (b.error ? "오류: " + (b.error.message || "(본문 없음)") : (b.data ?? []).map((x) => x.name).join(", ")));

/** 4. 공개 주소로 그림 한 장을 실제로 받아 본다 */
const { data: 한줄 } = await db.from("dot_posts").select("image_url").limit(1);
const 주소 = 한줄?.[0]?.image_url;
if (주소) {
  const res = await fetch(주소).catch((e) => ({ status: 0, statusText: String(e) }));
  console.log("사진 한 장      " + res.status + " " + (res.statusText ?? ""));
  console.log("  " + String(주소).slice(0, 110));
} else console.log("사진 한 장      dot_posts 를 못 읽어 주소를 모른다");
