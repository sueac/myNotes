import { createClient } from 'npm:@supabase/supabase-js@2'
import { pushToUser } from '../_shared/push.ts'

// Supabase provides these automatically inside Edge Functions.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
  try {
    const sent = await pushToUser(db, user_id, { title, body, url })
    return Response.json({ sent })
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'Push failed', { status: 500 })
  }
})
