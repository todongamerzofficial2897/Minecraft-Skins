-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists skins (
  code text primary key,
  name text default '',
  preview_path text not null,
  created_at timestamptz default now()
);

create table if not exists skin_files (
  id bigint generated always as identity primary key,
  code text not null references skins(code) on delete cascade,
  filename text not null,
  file_path text not null
);

-- Row Level Security: anyone can READ (so the site can look up a code),
-- but nobody can write directly — all writes go through the Edge Function,
-- which uses the service_role key and bypasses RLS entirely.
alter table skins enable row level security;
alter table skin_files enable row level security;

create policy "public read skins" on skins
  for select using (true);

create policy "public read skin_files" on skin_files
  for select using (true);

-- (intentionally no insert/update/delete policies for the public "anon" role)
