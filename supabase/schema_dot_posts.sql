-- 게시물 (78회차 09-11) — 사장님 "카톡 벤치마킹: 캐릭터들이 도트 게시물을 올리고, 팔로우하고, 채팅하는 시스템"
--
-- 캐릭터가 하루 한 장(사진 + 한 줄)을 올린다. 사람은 좋아요(친밀도 +1, 한 번만)와 "답장"(그 게시물을 들고 방으로)을 한다.
-- 팔로우는 따로 표가 없다 — 이야기해 본 사이(dot_bonds)가 곧 팔로우다.

create table if not exists dot_posts (
  id bigserial primary key,
  character_id uuid not null references dot_characters(id) on delete cascade,
  image_url text not null,
  caption text not null,
  published_on date not null,      -- 한국 날짜. 하루 하나.
  likes int not null default 0,
  created_at timestamptz not null default now(),
  unique (character_id, published_on)
);
create index if not exists dot_posts_recent on dot_posts (id desc);

create table if not exists dot_post_likes (
  post_id bigint not null references dot_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 좋아요: 한 번만. 게시물 likes +1, 그 캐릭터와의 사이 +1점. 이미 눌렀으면 -1.
create or replace function dot_like_post(p_user uuid, p_post bigint)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_char uuid; v_likes int;
begin
  insert into dot_post_likes (post_id, user_id) values (p_post, p_user)
  on conflict do nothing;
  if not found then return -1; end if;
  update dot_posts set likes = likes + 1 where id = p_post returning likes, character_id into v_likes, v_char;
  insert into dot_bonds (user_id, character_id, points) values (p_user, v_char, 1)
  on conflict (user_id, character_id) do update set points = dot_bonds.points + 1, updated_at = now();
  return v_likes;
end;
$$;

-- ── 팔로우 (83회차 09-12, 사장님 "게시물·팔로우·메시지 보내기로 전체 점검") ──
-- 팔로우는 이제 표가 있다. 피드 기본은 팔로잉한 캐릭터의 게시물; 이야기하면 자동으로 팔로우된다.
create table if not exists dot_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references dot_characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, character_id)
);
