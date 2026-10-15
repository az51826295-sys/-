-- 다국어 (10-13, 사장님 "전세계화해줘 내앱" — 영어·일본어).
--
-- 캐릭터 이름·소개·첫인사·고를 말·사진 설명, 게시물 한 줄은 **DB 에만** 있다(코드에 없다).
-- 그래서 번역도 DB 에 둔다. 한국어 원래 칸은 그대로 두고 옆에 한 칸을 더한다:
--
--   dot_characters.i18n = { "en": { "name": "Yuna", "tagline": "...", "greeting": "...", "chips": ["..."], "photos": ["사진 설명", ...] },
--                           "ja": { ... } }
--   dot_posts.i18n      = { "en": "caption", "ja": "caption" }
--   dot_push_subs.lang = 'ko' | 'en' | 'ja'   — 먼저 보내는 말을 그 사람 언어로
--
-- 칸이 비어 있으면 화면은 한국어 원래 글을 보인다(깨지지 않는다). 채우는 것은
-- `npx tsx engine/tools/dot_i18n_fill.mts` (모델로 옮긴다 — 인자 없이 돌리면 보기만, --write 로 채운다).
-- 코드는 이 파일을 안 돌린 DB 에서도 돈다(select("*") 로 읽어서 칸이 없으면 없는 대로).

alter table dot_characters add column if not exists i18n jsonb not null default '{}'::jsonb;
alter table dot_posts add column if not exists i18n jsonb not null default '{}'::jsonb;
alter table dot_push_subs add column if not exists lang text;
-- 그 사람의 시간대(IANA, 예: America/New_York). 먼저 말 걸기 창(11~22시)을 그 사람의 낮으로 잰다. 없으면 한국 시간.
alter table dot_push_subs add column if not exists tz text;
