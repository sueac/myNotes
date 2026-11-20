-- Schedules the send-reminders Edge Function to run every minute.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Replace the two placeholders first. Do NOT commit this file with real values in it.

-- 1. Turn on the scheduler (pg_cron) and HTTP-from-SQL (pg_net).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Keep the URL and secret in Vault so they don't appear in the job definition.
--    The URL must start with https:// or pg_net rejects it ("Bad scheme") and no request is sent.
--    The secret must be the same value you set with `supabase secrets set REMINDERS_CRON_SECRET=...`.
select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
select vault.create_secret('YOUR-REMINDERS-CRON-SECRET', 'reminders_cron_secret');

-- 3. Every minute, POST to the function with the secret in a header.
select cron.schedule(
  'send-due-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Useful later:
--   See recent runs:   select * from cron.job_run_details order by start_time desc limit 10;
--   See HTTP results:  select id, status_code, content from net._http_response order by created desc limit 10;
--   Stop the job:      select cron.unschedule('send-due-reminders');
