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
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
            break;
          }
        }
        return client.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
