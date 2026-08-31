// Service Worker for Chat Notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (!data.type || data.type !== 'SHOW_CHAT_NOTIFICATION') return;

  const title = data.title || 'Pesan baru';
  const options = {
    body: data.body || 'Anda menerima pesan baru.',
    icon: '/favicon.ico',
    tag: data.tag || 'chat-message',
    renotify: true,
    vibrate: [120, 50, 120],
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'New Message';
  const options = {
    body: data.body || 'You have received a new message.',
    icon: '/favicon.ico',
    tag: data.tag || 'chat-message',
    renotify: true,
    vibrate: [120, 50, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const notificationUrl = event.notification?.data?.url || '/';
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true, url: notificationUrl }).then((clientList) => {
      if (clientList.length > 0) {
        const client = clientList[0];
        return client.focus();
      }
      return self.clients.openWindow(notificationUrl);
    })
  );
});
