create table if not exists dot_characters (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text not null default '',
  persona text not null,
  speech text not null default '',
  greeting text not null default '안녕!',
  sprites jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists dot_bonds (
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references dot_characters(id) on delete cascade,
  points int not null default 0,
  stage int not null default 1,
  streak_days int not null default 0,
  last_talked_on date,
  memo jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, character_id)
);
create table if not exists dot_messages (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references dot_characters(id) on delete cascade,
  role text not null check (role in ('user', 'character')),
  content text not null,
  emotion text check (emotion in ('neutral', 'happy', 'shy', 'sad', 'angry', 'surprised')),
  created_at timestamptz not null default now()
);
create index if not exists dot_messages_recent on dot_messages (user_id, character_id, id desc);
create table if not exists dot_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  turns int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, day)
);
alter table dot_characters enable row level security;
alter table dot_bonds      enable row level security;
alter table dot_messages   enable row level security;
alter table dot_usage      enable row level security;
drop policy if exists dot_characters_read on dot_characters;
create policy dot_characters_read on dot_characters
  for select using (is_public = true);
drop policy if exists dot_bonds_own on dot_bonds;
create policy dot_bonds_own on dot_bonds
  for select using (auth.uid() = user_id);
drop policy if exists dot_messages_own on dot_messages;
create policy dot_messages_own on dot_messages
  for select using (auth.uid() = user_id);
drop policy if exists dot_usage_own on dot_usage;
create policy dot_usage_own on dot_usage
  for select using (auth.uid() = user_id);
create or replace function dot_take_turn(p_user uuid, p_day date, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turns int;
begin
  insert into dot_usage (user_id, day, turns)
  values (p_user, p_day, 1)
  on conflict (user_id, day) do update
    set turns = dot_usage.turns + 1
    where dot_usage.turns < p_limit
  returning turns into v_turns;
  return coalesce(v_turns, 0);
end;
$$;
create or replace function dot_give_back_turn(p_user uuid, p_day date)
returns void
language sql
security definer
set search_path = public
as $$
  update dot_usage set turns = greatest(0, turns - 1)
  where user_id = p_user and day = p_day;
$$;
create or replace function dot_add_tokens(p_user uuid, p_day date, p_in bigint, p_out bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update dot_usage set input_tokens = input_tokens + p_in, output_tokens = output_tokens + p_out
  where user_id = p_user and day = p_day;
$$;
alter table dot_characters add column if not exists look text not null default '';
alter table dot_characters add column if not exists chips jsonb not null default '[]'::jsonb;
alter table dot_characters add column if not exists formal_start boolean not null default true;
alter table dot_characters add column if not exists default_emotion text not null default 'neutral';
alter table dot_characters add column if not exists faces jsonb not null default '{}'::jsonb;
alter table dot_characters add column if not exists photos jsonb not null default '[]'::jsonb;
alter table dot_bonds add column if not exists mode text not null default 'normal' check (mode in ('normal', 'menhera'));
alter table dot_bonds add column if not exists pings_today int not null default 0;
alter table dot_bonds add column if not exists last_pinged_at timestamptz;
create table if not exists dot_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  menhera_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table dot_bonds add column if not exists last_seen_at timestamptz;
alter table dot_messages add column if not exists sticker text;
alter table dot_usage add column if not exists bonus_turns int not null default 0;  
alter table dot_usage add column if not exists ad_refills int not null default 0;   
alter table dot_usage add column if not exists paid_turns int not null default 0;   
create table if not exists dot_wallet (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits int not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists dot_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  menhera_until timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists dot_purchases (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text not null,
  credits int not null default 0,
  menhera_days int not null default 0,
  source text not null,          
  ref text,                      
  created_at timestamptz not null default now()
);
create index if not exists dot_purchases_user on dot_purchases (user_id, id desc);
create or replace function dot_take_turn(p_user uuid, p_day date, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turns int;
  v_credits int;
begin
  insert into dot_usage (user_id, day, turns)
  values (p_user, p_day, 1)
  on conflict (user_id, day) do update
    set turns = dot_usage.turns + 1
    where dot_usage.turns < p_limit + dot_usage.bonus_turns
  returning turns into v_turns;
  if v_turns is not null then return v_turns; end if;
  update dot_wallet set credits = credits - 1, updated_at = now()
    where user_id = p_user and credits > 0
  returning credits into v_credits;
  if v_credits is null then return 0; end if;
  update dot_usage set turns = turns + 1, paid_turns = paid_turns + 1
    where user_id = p_user and day = p_day
  returning turns into v_turns;
  return coalesce(v_turns, 0);
end;
$$;
create or replace function dot_give_back_turn(p_user uuid, p_day date, p_limit int default 30)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turns int; v_bonus int; v_paid int;
begin
  select turns, bonus_turns, paid_turns into v_turns, v_bonus, v_paid from dot_usage where user_id = p_user and day = p_day;
  if v_turns is null or v_turns <= 0 then return; end if;
  if v_paid > 0 and v_turns > p_limit + v_bonus then
    update dot_usage set turns = turns - 1, paid_turns = paid_turns - 1 where user_id = p_user and day = p_day;
    update dot_wallet set credits = credits + 1, updated_at = now() where user_id = p_user;
  else
    update dot_usage set turns = turns - 1 where user_id = p_user and day = p_day;
  end if;
end;
$$;
create or replace function dot_ad_refill(p_user uuid, p_day date, p_max int, p_turns int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v int;
begin
  insert into dot_usage (user_id, day, turns, ad_refills, bonus_turns)
  values (p_user, p_day, 0, 1, p_turns)
  on conflict (user_id, day) do update
    set ad_refills = dot_usage.ad_refills + 1, bonus_turns = dot_usage.bonus_turns + p_turns
    where dot_usage.ad_refills < p_max
  returning ad_refills into v;
  if v is null then return -1; end if;
  insert into dot_purchases (user_id, sku, credits, menhera_days, source) values (p_user, 'ad_refill', 0, 0, 'ad');
  return p_max - v;
end;
$$;
create or replace function dot_grant(p_user uuid, p_sku text, p_credits int, p_menhera_days int, p_source text, p_ref text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into dot_purchases (user_id, sku, credits, menhera_days, source, ref) values (p_user, p_sku, p_credits, p_menhera_days, p_source, p_ref);
  if p_credits > 0 then
    insert into dot_wallet (user_id, credits) values (p_user, p_credits)
    on conflict (user_id) do update set credits = dot_wallet.credits + p_credits, updated_at = now();
  end if;
  if p_menhera_days > 0 then
    insert into dot_entitlements (user_id, menhera_until) values (p_user, now() + p_menhera_days * interval '1 day')
    on conflict (user_id) do update
      set menhera_until = greatest(coalesce(dot_entitlements.menhera_until, now()), now()) + p_menhera_days * interval '1 day', updated_at = now();
  end if;
end;
$$;
create table if not exists dot_posts (
  id bigserial primary key,
  character_id uuid not null references dot_characters(id) on delete cascade,
  image_url text not null,
  caption text not null,
  published_on date not null,      
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
create table if not exists dot_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references dot_characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, character_id)
);
create table if not exists dot_push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  dead_at timestamptz
);
create index if not exists dot_push_subs_user on dot_push_subs (user_id);
alter table dot_bonds add column if not exists last_pinged_on date;
alter table dot_bonds add column if not exists ping_minute int;
alter table dot_bonds add column if not exists ping_day date;
alter table dot_push_subs enable row level security;
drop policy if exists dot_push_subs_own on dot_push_subs;
create policy dot_push_subs_own on dot_push_subs for select using (auth.uid() = user_id);
create table if not exists dot_turns (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references dot_characters(id) on delete cascade,
  model text not null,
  routing text,
  ms_prepare int not null default 0,
  ms_first_token int,            
  ms_model int not null default 0,
  ms_save int not null default 0,
  ms_total int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  emotion text,
  reply_chars int not null default 0,
  stage int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists dot_turns_recent on dot_turns (created_at desc);
alter table dot_turns enable row level security;
alter table dot_turns add column if not exists cached_tokens int not null default 0;