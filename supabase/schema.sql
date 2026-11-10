-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.

create table public.notes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id      text not null,
  title   text not null default '',
  body    text not null default '',
  updated bigint not null,
  primary key (user_id, id)
);

-- Row Level Security: each signed-in user can only see and change their own notes.
alter table public.notes enable row level security;

create policy "Users manage their own notes"
  on public.notes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
