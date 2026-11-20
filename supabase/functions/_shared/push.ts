import { sendNotification, type VapidDetails } from 'npm:web-push-neo'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

// Folders starting with "_" are not deployed as functions, so this is shared code only.

// These come from `supabase secrets set`. The library takes them with each send.
const vapidDetails: VapidDetails = {
  subject: Deno.env.get('VAPID_SUBJECT')!,
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!,
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY')!,
}

export type PushMessage = {
  title: string
  body: string
  url?: string
  // Notifications with the same tag replace each other instead of stacking.
  tag?: string
  // Keep the notification on screen until the user dismisses it.
  requireInteraction?: boolean
}

// Sends the message to every browser the user subscribed. Returns how many sends succeeded.
// `db` must use the service role key, because it reads another user's subscriptions.
export async function pushToUser(db: SupabaseClient, userId: string, message: PushMessage) {
  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)

  let sent = 0
  for (const s of subs ?? []) {
    try {
      await sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(message),
        { vapidDetails },
      )
      sent++
    } catch (err) {
      // 404 or 410 means the browser unsubscribed. Remove the stale row.
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      } else {
        console.error(`Push to ${s.endpoint} failed`, err)
      }
    }
  }
  return sent
}
