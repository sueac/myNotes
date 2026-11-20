
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {}
    event.waitUntil(
        self.registration.showNotification(data.title ?? 'Notes', {
            body: data.body ?? '',
            icon: '/favicon.svg',
            tag: data.tag,
            requireInteraction: data.requireInteraction ?? false,
            data: { url: data.url ?? '/' },
        }),
    )
})

// Focus the app if it's already open in a tab. Otherwise open it.
self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    event.waitUntil(
        (async () => {
            const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href
            const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
            const open = windows.find((w) => w.url.startsWith(self.location.origin))
            if (open) return open.focus()
            return clients.openWindow(url)
        })(),
    )
})
