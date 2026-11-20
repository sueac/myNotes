import { createClient } from 'npm:@supabase/supabase-js@2'
import { pushToUser } from '../_shared/push.ts'

// Called every minute by pg_cron (see supabase/reminders-cron.sql).
// Sends a push for each reminder whose time has come and that hasn't been sent yet.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Set with `supabase secrets set REMINDERS_CRON_SECRET=...`. Must match the value stored in Vault.
const CRON_SECRET = Deno.env.get('REMINDERS_CRON_SECRET')

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Use POST', { status: 405 })

  // This function is deployed without JWT checks, so the secret is the only thing keeping strangers out.
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const now = new Date().toISOString()

  // Claim every due reminder in a single UPDATE ... RETURNING. A reminder already claimed by an
  // earlier or overlapping run has notified_at set, so it is never sent twice.
  const { data: due, error } = await db
    .from('reminders')
    .update({ notified_at: now })
    .is('notified_at', null)
    .lte('remind_at', now)
    .select('id, user_id, text')
  if (error) return new Response(error.message, { status: 500 })

  let sent = 0
  for (const r of due ?? []) {
    try {
      sent += await pushToUser(db, r.user_id, {
        title: 'Reminder',
        body: r.text,
        url: '/',
        tag: `reminder-${r.id}`,
        requireInteraction: true,
      })
    } catch (err) {
      console.error(`Reminder ${r.id} failed`, err)
    }
  }

  return Response.json({ due: due?.length ?? 0, sent })
})
