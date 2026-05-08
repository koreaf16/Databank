/**
 * 파일: frontend/src/features/calendar/api/calendarApi.js
 * 역할: 일정관리(EVENTS + ATTENDANCE_NOTICES) 백엔드 API 호출.
 *       shared/api/apiClient.js를 사용해 envelope 자동 파싱.
 *
 * 연관 파일:
 *   - shared/api/apiClient.js                                  : fetch + envelope 파싱
 *   - features/calendar/components/CalendarPage.jsx            : 주 사용처
 *   - backend/src/modules/calendar/routes/calendarRoutes.js    : /api/calendar/events
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '../../../shared/api/apiClient.js';

// ── 일정 ──────────────────────────────────────────────────────────────────────

export function getEvents(params = {}) {
  const query = {};
  if (params.from)       query.from = params.from;
  if (params.to)         query.to = params.to;
  if (params.customerId) query.customerId = String(params.customerId);
  if (params.engineerId) query.engineerId = String(params.engineerId);
  if (params.type)       query.type = params.type;
  if (params.method)     query.method = params.method;
  return apiGet('/api/calendar/events', Object.keys(query).length ? query : undefined);
}

export function getEvent(id) {
  return apiGet(`/api/calendar/events/${id}`);
}

export function createEvent(payload) {
  return apiPost('/api/calendar/events', payload);
}

export function updateEvent(id, payload) {
  return apiPatch(`/api/calendar/events/${id}`, payload);
}

export function deleteEvent(id) {
  return apiDelete(`/api/calendar/events/${id}`);
}

export function editEventOccurrence(id, payload) {
  return apiPost(`/api/calendar/events/${id}/occurrences/edit`, payload);
}

export function deleteEventOccurrence(id, payload) {
  return apiPost(`/api/calendar/events/${id}/occurrences/delete`, payload);
}

// ── 직출/직퇴 알림 (attendance) ───────────────────────────────────────────────

export function getAttendanceNotices(params = {}) {
  const query = {};
  if (params.staffUserId) query.staffUserId = String(params.staffUserId);
  if (params.from)        query.from = params.from;
  if (params.to)          query.to = params.to;
  if (params.status)      query.status = params.status;
  return apiGet('/api/attendance/notices', Object.keys(query).length ? query : undefined);
}

export function createAttendanceNotice(payload) {
  return apiPost('/api/attendance/notices', payload);
}

export function updateAttendanceNotice(id, payload) {
  return apiPatch(`/api/attendance/notices/${id}`, payload);
}

// ── 날짜 유틸 (공통 사용) ─────────────────────────────────────────────────────

export function getWeekRange(anchorDate) {
  const d = anchorDate ? new Date(anchorDate) : new Date();
  const day = d.getDay(); // 0=일 1=월 ...
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return {
    from: mon.toISOString().slice(0, 10),
    to:   sun.toISOString().slice(0, 10),
    label: `${mon.getFullYear()}년 ${mon.getMonth() + 1}월 ${Math.ceil(mon.getDate() / 7)}주차`,
    monday: mon,
    dates: Array.from({ length: 7 }, (_, i) => {
      const day = new Date(mon);
      day.setDate(mon.getDate() + i);
      return String(day.getDate()).padStart(2, '0');
    }),
  };
}
