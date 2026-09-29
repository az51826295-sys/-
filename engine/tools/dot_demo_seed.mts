/**
 * **보여 주기용 자료 심기** (227회차 09-29). 모델 0 · 값 0.
 *   npx tsx engine/tools/dot_demo_seed.mts <uid>
 * 화면을 찍어 설명하려면 **보여 줄 것**이 있어야 한다. 빈 화면만 찍으면 무엇이 달라졌는지 안 보인다.
 * 심는 것: 캐릭터 전부 추가 · 내 게시물 3장(캐릭터 사진을 빌린다, 그림값 0) · 하트(유나 5=맞팔, 서하 2=진행중)
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const uid = process.argv[2];
if (!uid) { console.error("uid 가 필요하다"); process.exit(1); }

const { data: cs } = await db.from("dot_characters").select("id, slug, name, photos").eq("is_public", true);
const 사람 = (cs ?? []) as { id: string; slug: string; name: string; photos: { url: string }[] | null }[];
await db.from("dot_follows").upsert(사람.map((c) => ({ user_id: uid, character_id: c.id })), { onConflict: "user_id,character_id" });
console.log("추가:", 사람.map((c) => c.name).join(" "));

// 내 게시물 3장 — 캐릭터 사진을 빌린다(새로 그리면 값이 든다)
const 그림 = 사람.flatMap((c) => (c.photos ?? []).map((p) => p.url)).slice(0, 3);
const 캡션 = ["오늘 빵 굽는 냄새", "비 오는 저녁", "야근 끝"];
const { data: made } = await db.from("dot_user_posts")
  .insert(그림.map((image_url, i) => ({ user_id: uid, image_url, caption: 캡션[i] ?? "" })))
  .select("id");
const ids = (made ?? []).map((p) => p.id as number);
console.log("내 게시물:", ids.length, "장");

// 하트 — 이미 도착한 것으로(과거 시각)
const 유나 = 사람.find((c) => c.slug === "yuna"), 서하 = 사람.find((c) => c.slug === "seoha");
const 과거 = (분: number) => new Date(Date.now() - 분 * 60_000).toISOString();
const 줄: { post_id: number; character_id: string; created_at: string }[] = [];
// 유나 5개(맞팔 문턱) — 게시물이 3장이라 한 장에 여러 캐릭터가 아니라 **한 캐릭터가 여러 장**에 준다.
// 표의 기본키가 (게시물, 캐릭터) 라 한 장에 같은 사람이 두 번은 못 준다 → 게시물을 더 만든다.
const { data: more } = await db.from("dot_user_posts")
  .insert([0, 1].map((i) => ({ user_id: uid, image_url: 그림[i % 그림.length], caption: ["창밖", "쉬는 날"][i] })))
  .select("id");
const 전체 = [...ids, ...((more ?? []).map((p) => p.id as number))];
if (유나) for (const id of 전체.slice(0, 5)) 줄.push({ post_id: id, character_id: 유나.id, created_at: 과거(30) });
if (서하) for (const id of 전체.slice(0, 2)) 줄.push({ post_id: id, character_id: 서하.id, created_at: 과거(20) });
if (줄.length) {
  const { error } = await db.from("dot_user_post_likes").upsert(줄, { onConflict: "post_id,character_id" });
  console.log(error ? "하트 못 넣음: " + error.message : `하트 ${줄.length}개 (유나 5 · 서하 2)`);
}
console.log("게시물 전부:", 전체.length, "장");
