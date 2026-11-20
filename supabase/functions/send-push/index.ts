import { sendNotification, type VapidDetails } from 'npm:web-push-neo'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Supabase provides these automatically inside Edge Functions.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// These come from `supabase secrets set`. The library takes them with each send.
const vapidDetails: VapidDetails = {
  subject: Deno.env.get('VAPID_SUBJECT')!,
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!,
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY')!,
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Use POST', { status: 405 })

  const { user_id, title, body, url } = await req.json()

  // Only a signed-in user can send, and only to their own browsers.
  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await caller.auth.getUser()
  if (!user || user.id !== user_id) return new Response('Unauthorized', { status: 401 })

  // The service role key bypasses row-level security, so we can read this user's subscriptions.
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', user_id)
  if (error) return new Response(error.message, { status: 500 })

  let sent = 0
  for (const s of subs ?? []) {
    try {
      await sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, url }),
        { vapidDetails },
      )
      sent++
    } catch (err) {
      // 404 or 410 means the browser unsubscribed. Remove the stale row.
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    }
  }

  return Response.json({ sent })
})
