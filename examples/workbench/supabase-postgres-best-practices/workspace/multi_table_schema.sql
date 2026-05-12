-- multi_table_schema.sql: multi-tenant SaaS schema for a small social app.
-- Six tables: four hold per-user data (users, posts, comments, messages)
-- and two are global reference data (countries, currencies).

-- =====================================================================
-- 1. users — primary account table
-- =====================================================================
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  created_at timestamptz default now()
);

alter table users enable row level security;
alter table users force row level security;

create policy users_self_read on users
  for select using ((select auth.uid()) = id);


-- =====================================================================
-- 2. posts — user-authored content
-- =====================================================================
create table posts (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text,
  published_at timestamptz
);

create index posts_user_id_idx on posts (user_id);

alter table posts enable row level security;

create policy posts_owner_all on posts
  for all using ((select auth.uid()) = user_id);


-- =====================================================================
-- 3. comments — replies to posts
-- =====================================================================
create table comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references posts(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

create index comments_post_id_idx on comments (post_id);
create index comments_author_id_idx on comments (author_id);


-- =====================================================================
-- 4. countries — global reference data
-- =====================================================================
create table countries (
  code char(2) primary key,
  name text not null
);


-- =====================================================================
-- 5. messages — direct user-to-user messages
-- =====================================================================
create table messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references users(id) on delete cascade,
  recipient_id uuid not null references users(id) on delete cascade,
  body text not null,
  sent_at timestamptz default now()
);

create index messages_sender_id_idx on messages (sender_id);
create index messages_recipient_id_idx on messages (recipient_id);


-- =====================================================================
-- 6. currencies — global reference data
-- =====================================================================
create table currencies (
  code char(3) primary key,
  name text not null,
  symbol text
);
