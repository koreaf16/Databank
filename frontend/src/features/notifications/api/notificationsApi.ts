import { apiGet, apiPatch, apiPost, getAuthToken, toApiUrl } from '../../../shared/api/apiClient.js';

export function getNotifications(params = {}) {
  const query: Record<string, string> = {};
  if ((params as any).unreadOnly) query.unreadOnly = 'true';
  if ((params as any).limit) query.limit = String((params as any).limit);
  return apiGet('/api/notifications', Object.keys(query).length ? query : undefined);
}

export function markNotificationRead(id: string) {
  return apiPatch(`/api/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return apiPost('/api/notifications/read-all');
}

export function openNotificationStream() {
  const token = getAuthToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return new EventSource(toApiUrl(`/api/notifications/stream${query}`));
}
