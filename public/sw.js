
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {}
    event.waitUntil(
        self.registration.showNotification(data.title ?? 'Notes', {
            body: data.body ?? '',
            icon: '/favicon.svg',
            data: { url: data.url ?? '/' },
        }),
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url))
})