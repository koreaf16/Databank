// @ts-nocheck
/**
 * 파일: backend/src/modules/notifications/services/notificationHub.ts
 * 역할: 앱 내부 알림 SSE 연결 관리.
 */

const clients = new Map<number, Set<any>>();

export function subscribeNotifications(userId: number, res: any) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  return () => {
    clients.get(userId)?.delete(res);
    if (clients.get(userId)?.size === 0) clients.delete(userId);
  };
}

export function publishNotification(userId: number, notification: any) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
  for (const res of set) {
    try { res.write(payload); }
    catch { set.delete(res); }
  }
}

