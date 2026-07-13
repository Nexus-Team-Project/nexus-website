/**
 * Service Worker — handles push notifications for Nexus admin dashboard.
 * Registered by the frontend when an admin enables push notifications.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Nexus', body: event.data.text() };
  }

  const { title, body, url, tag } = payload;

  event.waitUntil(
    self.registration.showNotification(title || 'Nexus', {
      body: body || '',
      icon: '/nexus-favicon.svg',
      badge: '/nexus-favicon.svg',
      tag: tag || 'nexus-default',
      data: { url: url || '/' },
      requireInteraction: true,
      dir: 'rtl',
      lang: 'he',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url);
    }),
  );
});
