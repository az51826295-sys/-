/**
 * # 오늘치 게시물을 **지금** 올린다  (11-09)
 *
 *   npx tsx engine/tools/dot_post_now.mts
 *
 * 일꾼이 옛 DB 를 보고 있어서(재배선은 사장님 손) 앱 쪽 피드에 새 글이 안 들어온다.
 * 그때까지 손으로 미는 자리다. **제품 코드(`postTick`)를 그대로 부른다** — 손으로 글을
 * 지어 넣으면 그날부터 피드가 거짓이 된다.
 *
 * `force` 라 시각 창(11~22시)을 안 보지만, **오늘 이미 올린 사람은 건너뛴다**(표의 유일 제약).
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { postTick } = await import("../../src/lib/dot/posts");
const r = await postTick(createServiceClient(), (s) => console.log(s), true);
console.log(`\n올린 글 ${r.posted}개`);
