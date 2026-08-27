self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'QLMED', body: 'Nova nota recebida', url: '/fiscal/invoices' };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    // payload ausente ou nao-JSON: usa o padrao sem dado fiscal
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192-v2.png',
      data: { url: data.url || '/fiscal/invoices' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/fiscal/invoices';
  event.waitUntil(self.clients.openWindow(target));
});
