import { supabase } from './supabase'

// Browsers want the VAPID public key as raw bytes, not the base64url text we copied.
const urlBase64ToUint8Array = (base64: string) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

// Asks permission, subscribes this browser to push, and saves the subscription for the user.
export async function enableNotifications(userId: string) {
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!publicKey) throw new Error('Missing VITE_VAPID_PUBLIC_KEY in .env.local')
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Notifications are not supported in this browser')
  }

  // Browsers only show the permission prompt in response to a click.
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications were blocked')

  // Register sw.js (from step 2), then wait until it is active.
  await navigator.serviceWorker.register('/sw.js')
  const reg = await navigator.serviceWorker.ready

  // Ask the push service for a subscription. Reuse one if this browser already has it.
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }))

  // Save the endpoint and keys so the server can send to this browser later.
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  })
  if (error) throw new Error(`Couldn't save subscription: ${error.message}`)
}
