// @ts-nocheck
/**
 * 파일: backend/src/modules/calendar/repository/eventsRepository.ts
 * 역할: 일정(EVENTS + EVENT_PARTICIPANTS) CRUD, 반복 일정 확장, occurrence 단위 편집/삭제.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import oracledb from 'oracledb';
import {
  requiredText,
  nullableText,
  requiredId,
  toNullableInt,
  toFlag,
  clobFetchHandler,
  notFoundError,
  validationError,
  loadSql,
} from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const MAX_RECURRENCE_INSTANCES = 2000;

export async function listEvents(connection, filters = {}) {
  const conditions = ['e.ENABLED = 1'];
  const binds = {};

  const from = normalizeDateOnly(filters.from);
  const to = normalizeDateOnly(filters.to);
  if (from && to) {
    conditions.push(`(e.RECURRENCE_RULE IS NOT NULL OR (e.END_AT >= TO_TIMESTAMP(:range_from, 'YYYY-MM-DD"T"HH24:MI') AND e.START_AT < TO_TIMESTAMP(:range_to, 'YYYY-MM-DD"T"HH24:MI')))`);
    binds.range_from = `${from}T00:00`;
    binds.range_to = `${addDaysToDateOnly(to, 1)}T00:00`;
  } else if (from) {
    conditions.push(`(e.RECURRENCE_RULE IS NOT NULL OR e.END_AT >= TO_TIMESTAMP(:range_from, 'YYYY-MM-DD"T"HH24:MI'))`);
    binds.range_from = `${from}T00:00`;
  } else if (to) {
    conditions.push(`e.START_AT < TO_TIMESTAMP(:range_to, 'YYYY-MM-DD"T"HH24:MI')`);
    binds.range_to = `${addDaysToDateOnly(to, 1)}T00:00`;
  }

  if (filters.customerId) { conditions.push('e.CUSTOMER_ID = :customer_id'); binds.customer_id = Number(filters.customerId); }
  if (filters.engineerId) { conditions.push('EXISTS (SELECT 1 FROM EVENT_PARTICIPANTS ep WHERE ep.EVENT_ID = e.EVENT_ID AND ep.USER_ID = :eng_id)'); binds.eng_id = Number(filters.engineerId); }
  if (filters.type)   { conditions.push('e.EVENT_TYPE = :event_type'); binds.event_type = filters.type; }
  if (filters.method) { conditions.push('e.METHOD = :method'); binds.method = filters.method; }
  if (filters.q)      { conditions.push('(UPPER(e.TITLE) LIKE UPPER(:q) OR UPPER(e.MEMO) LIKE UPPER(:q) OR UPPER(c.CUSTOMER_MAIN) LIKE UPPER(:q))'); binds.q = `%${String(filters.q).trim()}%`; }

  const where = conditions.join(' AND ');
  const fullSql = `${sql('selectEvent.sql')} WHERE ${where} ORDER BY e.START_AT`;

  const result = await connection.execute(fullSql, binds, { fetchTypeHandler: clobFetchHandler });

  const rows = (result.rows || []).map(rowToEvent);
  const expanded = expandRecurringEvents(rows, { from, to });
  return attachParticipants(connection, expanded);
}

export async function findEventById(connection, eventId) {
  const fullSql = `${sql('selectEvent.sql')} WHERE e.EVENT_ID = :id AND e.ENABLED = 1`;
  const result = await connection.execute(fullSql, { id: eventId }, { fetchTypeHandler: clobFetchHandler });
  const event = result.rows?.[0] ? rowToEvent(result.rows[0]) : null;
  if (!event) return null;
  event.participants = await fetchParticipants(connection, eventId);
  return event;
}

export async function createEvent(connection, payload = {}) {
  const normalized = normalizeEventInput(payload);
  validateDateRange(normalized.startAt, normalized.endAt);

  const insertResult = await connection.execute(sql('insertEvent.sql'), {
    title: normalized.title,
    event_type: normalized.eventType,
    customer_id: normalized.customerId,
    service_name: normalized.serviceName,
    start_at: normalized.startAt,
    end_at: normalized.endAt,
    method: normalized.method,
    memo: normalized.memo,
    created_by: normalized.createdBy,
    all_day: normalized.allDay,
    color: normalized.color,
    location: normalized.location,
    reminder_minutes: normalized.reminderMinutes,
    recurrence_rule: normalized.recurrenceRule,
    recurrence_exdates: normalized.recurrenceExdates,
    recurrence_master_id: normalized.recurrenceMasterId,
    recurrence_original_start: normalized.recurrenceOriginalStart,
    out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
  });
  const newId = insertResult.outBinds.out_id[0];

  const participants = toParticipantArray(payload.participants);
  await upsertParticipants(connection, newId, participants, payload.createdBy);

  return findEventById(connection, newId);
}

export async function updateEvent(connection, eventId, payload = {}) {
  const id = requiredId(eventId);
  const current = await findEventById(connection, id);
  if (!current) throw notFoundError('일정을 찾을 수 없습니다');

  const has = k => Object.prototype.hasOwnProperty.call(payload, k);
  const nextPayload = {
    title: has('title') ? payload.title : current.title,
    eventType: has('eventType') ? payload.eventType : current.eventType,
    customerId: has('customerId') ? payload.customerId : current.customerId,
    serviceName: has('serviceName') ? payload.serviceName : current.serviceName,
    startAt: has('startAt') ? payload.startAt : current.startAt,
    endAt: has('endAt') ? payload.endAt : current.endAt,
    method: has('method') ? payload.method : current.method,
    memo: has('memo') ? payload.memo : has('notes') ? payload.notes : current.memo,
    createdBy: current.createdBy,
    allDay: has('allDay') ? payload.allDay : current.allDay,
    color: has('color') ? payload.color : current.color,
    location: has('location') ? payload.location : current.location,
    reminderMinutes: has('reminderMinutes') ? payload.reminderMinutes : current.reminderMinutes,
    recurrenceRule: has('recurrenceRule') ? payload.recurrenceRule : current.recurrenceRule,
    recurrenceExdates: has('recurrenceExdates') ? payload.recurrenceExdates : current.recurrenceExdates,
    recurrenceMasterId: has('recurrenceMasterId') ? payload.recurrenceMasterId : current.recurrenceMasterId,
    recurrenceOriginalStart: has('recurrenceOriginalStart') ? payload.recurrenceOriginalStart : current.recurrenceOriginalStart,
  };
  const normalized = normalizeEventInput(nextPayload, { partial: false });
  validateDateRange(normalized.startAt, normalized.endAt);

  await connection.execute(sql('updateEvent.sql'), {
    id,
    title: normalized.title,
    event_type: normalized.eventType,
    customer_id: normalized.customerId,
    service_name: normalized.serviceName,
    start_at: normalized.startAt,
    end_at: normalized.endAt,
    method: normalized.method,
    memo: normalized.memo,
    all_day: normalized.allDay,
    color: normalized.color,
    location: normalized.location,
    reminder_minutes: normalized.reminderMinutes,
    recurrence_rule: normalized.recurrenceRule,
    recurrence_exdates: normalized.recurrenceExdates,
    recurrence_master_id: normalized.recurrenceMasterId,
    recurrence_original_start: normalized.recurrenceOriginalStart,
  });
  if (has('participants')) await upsertParticipants(connection, id, toParticipantArray(payload.participants), null);
  return findEventById(connection, id);
}

export async function deleteEvent(connection, eventId) {
  const id = requiredId(eventId);
  const current = await findEventById(connection, id);
  if (!current) throw notFoundError('일정을 찾을 수 없습니다');
  await connection.execute(sql('deleteEvent.sql'), { id });
  return { id, deleted: true };
}

export async function editEventOccurrence(connection, eventId, payload = {}) {
  const id = requiredId(eventId);
  const current = await findEventById(connection, id);
  if (!current) throw notFoundError('반복 일정을 찾을 수 없습니다');

  const scope = payload.scope || 'single';
  const originalStart = normalizeTimestampText(payload.originalStart, '반복 원본 일시');
  const changes = payload.changes || {};

  if (scope === 'all') return updateEvent(connection, id, changes);

  if (scope === 'following') {
    await truncateRecurringEvent(connection, current, originalStart);
    const newPayload = buildOccurrencePayload(current, originalStart, changes, { keepRecurrence: true });
    newPayload.recurrenceExdates = [];
    newPayload.recurrenceMasterId = null;
    newPayload.recurrenceOriginalStart = null;
    return createEvent(connection, newPayload);
  }

  await appendRecurrenceExdate(connection, current, originalStart);
  const detachedPayload = buildOccurrencePayload(current, originalStart, changes, { keepRecurrence: false });
  detachedPayload.recurrenceMasterId = id;
  detachedPayload.recurrenceOriginalStart = originalStart;
  return createEvent(connection, detachedPayload);
}

export async function deleteEventOccurrence(connection, eventId, payload = {}) {
  const id = requiredId(eventId);
  const current = await findEventById(connection, id);
  if (!current) throw notFoundError('반복 일정을 찾을 수 없습니다');

  const scope = payload.scope || 'single';
  const originalStart = normalizeTimestampText(payload.originalStart, '반복 원본 일시');

  if (scope === 'all') return deleteEvent(connection, id);
  if (scope === 'following') {
    await truncateRecurringEvent(connection, current, originalStart);
    return { id, deleted: false, scope };
  }

  await appendRecurrenceExdate(connection, current, originalStart);
  return { id, deleted: false, scope };
}

export async function fetchEventReminderRecipients(connection, eventId, createdBy = null) {
  const recipients = new Set();
  const owner = toNullableInt(createdBy);
  if (owner) recipients.add(owner);

  const result = await connection.execute(
    `SELECT USER_ID AS "userId" FROM EVENT_PARTICIPANTS WHERE EVENT_ID = :id`,
    { id: eventId },
  );
  for (const row of result.rows || []) {
    const userId = Number(row.userId);
    if (Number.isFinite(userId)) recipients.add(userId);
  }
  return [...recipients];
}

async function fetchParticipants(connection, eventId) {
  const result = await connection.execute(sql('fetchParticipants.sql'), { id: eventId });
  return result.rows || [];
}

async function attachParticipants(connection, events) {
  const eventIds = [...new Set(events
    .map(event => Number(event.baseId || event.id))
    .filter(id => Number.isFinite(id)))];
  const participantsByEventId = await fetchParticipantsByEventIds(connection, eventIds);
  return events.map(event => ({
    ...event,
    participants: participantsByEventId.get(Number(event.baseId || event.id)) || [],
  }));
}

async function fetchParticipantsByEventIds(connection, eventIds) {
  const ids = eventIds.map(id => Number(id)).filter(id => Number.isFinite(id));
  const participantsByEventId = new Map();
  if (ids.length === 0) return participantsByEventId;

  const binds = {};
  const placeholders = ids.map((id, index) => {
    const key = `id_${index}`;
    binds[key] = id;
    return `:${key}`;
  });
  const rawSql = sql('fetchParticipantsByEventIds.sql').replace('/*PLACEHOLDER*/', placeholders.join(', '));
  const result = await connection.execute(rawSql, binds);

  for (const row of result.rows || []) {
    const eventId = Number(row.eventId);
    if (!participantsByEventId.has(eventId)) participantsByEventId.set(eventId, []);
    participantsByEventId.get(eventId).push({
      userId: row.userId,
      name: row.name,
      role: row.role,
    });
  }
  return participantsByEventId;
}

async function upsertParticipants(connection, eventId, userIds, ownerId) {
  await connection.execute(sql('deleteParticipantsByEventId.sql'), { id: eventId });
  const ownerNum = toNullableInt(ownerId);
  const allIds = new Set([...userIds, ...(ownerNum ? [ownerNum] : [])]);
  for (const userId of allIds) {
    const role = userId === ownerNum ? 'owner' : 'participant';
    await connection.execute(sql('insertParticipant.sql'), { event_id: eventId, user_id: userId, role });
  }
}

async function appendRecurrenceExdate(connection, event, originalStart) {
  const exdates = Array.isArray(event.recurrenceExdates) ? event.recurrenceExdates : [];
  const normalized = normalizeTimestampText(originalStart, '반복 원본 일시');
  const next = [...new Set([...exdates, normalized])].sort();
  await connection.execute(sql('updateRecurrenceExdates.sql'), { id: event.id, exdates: JSON.stringify(next) });
}

async function truncateRecurringEvent(connection, event, originalStart) {
  const original = parseLocalDateTime(originalStart);
  const seriesStart = parseLocalDateTime(event.startAt);
  if (original <= seriesStart) {
    await deleteEvent(connection, event.id);
    return;
  }
  const until = formatDateOnly(addDays(original, -1));
  const rule = normalizeRecurrenceRuleObject(event.recurrenceRule) || {};
  const nextRule = { ...rule, ends: 'until', until };
  await connection.execute(sql('updateRecurrenceRule.sql'), { id: event.id, rule: JSON.stringify(nextRule) });
}

function buildOccurrencePayload(master, originalStart, changes, options) {
  const duration = parseLocalDateTime(master.endAt).getTime() - parseLocalDateTime(master.startAt).getTime();
  const startAt = changes.startAt ? normalizeTimestampText(changes.startAt, '시작 일시') : originalStart;
  const endAt = changes.endAt ? normalizeTimestampText(changes.endAt, '종료 일시') : formatLocalDateTime(new Date(parseLocalDateTime(startAt).getTime() + duration));

  return {
    title: changes.title ?? master.title,
    eventType: changes.eventType ?? master.eventType,
    customerId: changes.customerId ?? master.customerId,
    serviceName: changes.serviceName ?? master.serviceName,
    startAt,
    endAt,
    method: changes.method ?? master.method,
    memo: changes.memo ?? master.memo,
    createdBy: changes.createdBy ?? master.createdBy,
    allDay: changes.allDay ?? master.allDay,
    color: changes.color ?? master.color,
    location: changes.location ?? master.location,
    reminderMinutes: changes.reminderMinutes ?? master.reminderMinutes,
    recurrenceRule: options.keepRecurrence ? (changes.recurrenceRule ?? master.recurrenceRule) : null,
    recurrenceExdates: options.keepRecurrence ? (changes.recurrenceExdates ?? master.recurrenceExdates ?? []) : [],
    participants: changes.participants,
  };
}

function normalizeEventInput(payload = {}) {
  const title = requiredText(payload.title, '제목');
  const eventType = requiredText(payload.eventType || 'meeting', '일정 유형');
  const startAt = normalizeTimestampText(payload.startAt, '시작 일시');
  const endAt = normalizeTimestampText(payload.endAt, '종료 일시');

  return {
    title,
    eventType,
    startAt,
    endAt,
    customerId: toNullableInt(payload.customerId),
    serviceName: nullableText(payload.serviceName),
    method: nullableText(payload.method),
    memo: nullableText(payload.memo ?? payload.notes),
    createdBy: toNullableInt(payload.createdBy),
    allDay: toFlag(payload.allDay, false),
    color: nullableText(payload.color),
    location: nullableText(payload.location),
    reminderMinutes: toNullableInt(payload.reminderMinutes),
    recurrenceRule: stringifyNullableJson(payload.recurrenceRule),
    recurrenceExdates: stringifyNullableJson(payload.recurrenceExdates ?? []),
    recurrenceMasterId: toNullableInt(payload.recurrenceMasterId),
    recurrenceOriginalStart: payload.recurrenceOriginalStart ? normalizeTimestampText(payload.recurrenceOriginalStart, '반복 원본 일시') : null,
  };
}

function validateDateRange(startAt, endAt) {
  if (parseLocalDateTime(endAt) <= parseLocalDateTime(startAt)) {
    throw validationError('종료 일시는 시작 일시보다 이후여야 합니다');
  }
}

function rowToEvent(row) {
  return {
    ...row,
    allDay: Number(row.allDay || 0) === 1,
    reminderMinutes: row.reminderMinutes == null ? null : Number(row.reminderMinutes),
    recurrenceRule: parseNullableJson(row.recurrenceRule, null),
    recurrenceExdates: parseNullableJson(row.recurrenceExdates, []),
    recurrenceInstance: false,
    baseId: row.id,
  };
}

function expandRecurringEvents(events, range) {
  const rangeStart = parseLocalDateTime(`${range.from || '1970-01-01'}T00:00`);
  const rangeEnd = parseLocalDateTime(`${addDaysToDateOnly(range.to || '2100-12-31', 1)}T00:00`);
  const output = [];

  for (const event of events) {
    if (event.recurrenceRule && !event.recurrenceMasterId) {
      output.push(...expandRecurringEvent(event, rangeStart, rangeEnd));
      continue;
    }
    if (eventOverlapsRange(event, rangeStart, rangeEnd)) output.push(event);
  }
  return output.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
}

function expandRecurringEvent(event, rangeStart, rangeEnd) {
  const rule = normalizeRecurrenceRuleObject(event.recurrenceRule);
  if (!rule) return [event].filter(e => eventOverlapsRange(e, rangeStart, rangeEnd));

  const start = parseLocalDateTime(event.startAt);
  const end = parseLocalDateTime(event.endAt);
  const durationMs = end.getTime() - start.getTime();
  const exdates = new Set((event.recurrenceExdates || []).map(v => normalizeTimestampText(v, '예외 일시')));
  const until = parseRuleUntil(rule.until);
  const countLimit = Number.isFinite(Number(rule.count)) ? Math.max(1, Number(rule.count)) : null;
  const interval = Math.max(1, Number(rule.interval) || 1);
  const instances = [];
  let generated = 0;

  function pushCandidate(cursor) {
    if (cursor < start) return false;
    if (until && cursor > until) return true;
    generated += 1;
    if (countLimit && generated > countLimit) return true;

    const candidateStart = formatLocalDateTime(cursor);
    if (exdates.has(candidateStart)) return false;

    const candidateEndDate = new Date(cursor.getTime() + durationMs);
    if (candidateEndDate > rangeStart && cursor < rangeEnd) {
      instances.push({
        ...event,
        id: `${event.id}::${candidateStart}`,
        baseId: event.id,
        recurrenceInstance: true,
        recurrenceMasterId: event.id,
        recurrenceOriginalStart: candidateStart,
        startAt: candidateStart,
        endAt: formatLocalDateTime(candidateEndDate),
      });
    }
    return false;
  }

  const freq = String(rule.freq || 'weekly').toLowerCase();
  if (freq === 'daily') {
    for (let i = 0, cursor = new Date(start); i < MAX_RECURRENCE_INSTANCES && cursor < rangeEnd; i += 1, cursor = addDays(start, i * interval)) {
      if (pushCandidate(cursor)) break;
    }
  } else if (freq === 'monthly') {
    const dayOfMonth = Number(rule.byMonthDay) || start.getDate();
    for (let i = 0; i < MAX_RECURRENCE_INSTANCES; i += 1) {
      const cursor = addMonthsClamped(start, i * interval, dayOfMonth);
      if (cursor >= rangeEnd) break;
      if (pushCandidate(cursor)) break;
    }
  } else {
    const byWeekday = normalizeWeekdays(rule.byWeekday, WEEKDAYS[start.getDay()]);
    for (let day = new Date(start), safety = 0; day < rangeEnd && safety < MAX_RECURRENCE_INSTANCES * 7; day = addDays(day, 1), safety += 1) {
      const weekDiff = Math.floor((startOfDay(day).getTime() - startOfDay(start).getTime()) / (7 * 86400000));
      if (weekDiff < 0 || weekDiff % interval !== 0) continue;
      if (!byWeekday.includes(WEEKDAYS[day.getDay()])) continue;
      const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.getHours(), start.getMinutes(), 0, 0);
      if (pushCandidate(candidate)) break;
      if (countLimit && generated >= countLimit) break;
    }
  }

  return instances;
}

function eventOverlapsRange(event, rangeStart, rangeEnd) {
  return parseLocalDateTime(event.endAt) > rangeStart && parseLocalDateTime(event.startAt) < rangeEnd;
}

function normalizeRecurrenceRuleObject(value) {
  const rule = typeof value === 'string' ? parseNullableJson(value, null) : value;
  if (!rule || typeof rule !== 'object') return null;
  const freq = String(rule.freq || '').toLowerCase();
  if (!['daily', 'weekly', 'monthly'].includes(freq)) return null;
  return rule;
}

function normalizeWeekdays(value, fallback) {
  const input = Array.isArray(value) ? value : [fallback];
  const normalized = input.map(v => String(v || '').slice(0, 2).toUpperCase()).filter(v => WEEKDAYS.includes(v));
  return normalized.length ? normalized : [fallback];
}

function parseRuleUntil(value) {
  if (!value) return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return parseLocalDateTime(`${text}T23:59`);
  return parseLocalDateTime(normalizeTimestampText(text, '반복 종료 일시'));
}

function stringifyNullableJson(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value.trim() || null;
  return JSON.stringify(value);
}

function parseNullableJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); }
  catch { return fallback; }
}

function normalizeTimestampText(value, fieldName) {
  const text = requiredText(value, fieldName);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return text.slice(0, 16);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00`;
  throw validationError(`${fieldName} 형식이 올바르지 않습니다`);
}

function normalizeDateOnly(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function parseLocalDateTime(value) {
  const normalized = normalizeTimestampText(value, '일시');
  const [date, time] = normalized.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function formatLocalDateTime(date) {
  return `${formatDateOnly(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDateOnly(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addDaysToDateOnly(dateOnly, days) {
  const [year, month, day] = String(dateOnly).split('-').map(Number);
  return formatDateOnly(new Date(year, month - 1, day + days));
}

function addMonthsClamped(base, months, dayOfMonth) {
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1, base.getHours(), base.getMinutes(), 0, 0);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(dayOfMonth, lastDay));
  return target;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toParticipantArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(v => Number.parseInt(String(v), 10)).filter(n => Number.isFinite(n));
}
