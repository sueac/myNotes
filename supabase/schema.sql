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


create table push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null
);

alter table push_subscriptions enable row level security;

create policy "own subscriptions" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reminders. If the tables above already exist, run only this block.
create table public.reminders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 200),
  remind_at  timestamptz not null,
  created_at timestamptz not null default now()
);

create index reminders_user_time_idx on public.reminders (user_id, remind_at);

alter table public.reminders enable row level security;

create policy "Users manage their own reminders"
  on public.reminders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- Reminder notifications. Run this block once (after the reminders block above).
-- notified_at is set by the send-reminders function when it sends the push.
alter table public.reminders add column if not exists notified_at timestamptz;

-- Reminders that were already past due before notifications existed shouldn't all fire at once.
update public.reminders set notified_at = now() where notified_at is null and remind_at <= now();

-- The function looks up "due and not yet sent" every minute. This partial index keeps that cheap.
create index if not exists reminders_pending_idx
  on public.reminders (remind_at)
  where notified_at is null;
