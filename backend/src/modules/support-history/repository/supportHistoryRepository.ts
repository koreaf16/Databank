/**
 * 파일: backend/src/modules/support-history/repository/supportHistoryRepository.ts
 * 역할: 지원이력(SUPPORT_HISTORIES + SUPPORT_HISTORY_PARTICIPANTS) 테이블 CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  requiredText,
  nullableText,
  nullableClob,
  toNullableInt,
  clobFetchHandler,
  notFoundError,
  validationError,
  loadSql,
  has,
} from '../../../infra/oracle/helpers.js';
import { insertSamplesBatch, type MetricSampleInsert } from '../../metrics/repository/metricRepository.js';
import {
  setHistoryTargets,
  fetchTargetsForHistories,
  listHistoryTargets,
} from './historyTargetRepository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

// ── 내부 유틸 ─────────────────────────────────────────────────────────────────

function generateHistoryId() {
  const ts = Date.now().toString(36).slice(-5).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `H-${ts}${rnd}`;
}

async function fetchParticipants(connection: any, historyId: string) {
  const result = await connection.execute(sql('fetchParticipants.sql'), { hid: historyId });
  return (result.rows || []).map((p: any) => ({ ...p, isManager: p.isManager === 1 }));
}

async function replaceParticipants(connection: any, historyId: string, participants: any[], managerId: any) {
  await connection.execute(sql('deleteParticipants.sql'), { hid: historyId });
  const managerNum = toNullableInt(managerId);
  const seen = new Set<number>();
  for (const p of participants) {
    const userId = Number.parseInt(String(p?.id ?? p), 10);
    if (!Number.isFinite(userId) || seen.has(userId)) continue;
    seen.add(userId);
    const isManager = userId === managerNum ? 1 : 0;
    await connection.execute(sql('insertParticipant.sql'), { hid: historyId, usrId: userId, is_mgr: isManager });
  }
  if (managerNum && !seen.has(managerNum)) {
    await connection.execute(sql('insertParticipant.sql'), { hid: historyId, usrId: managerNum, is_mgr: 1 });
  }
}

function rowToTimeline(row: any) {
  const timeline: any = {};
  if (row.departureAt)      timeline.departureAt      = row.departureAt;
  if (row.supportStartedAt) timeline.supportStartedAt = row.supportStartedAt;
  if (row.supportEndedAt)   timeline.supportEndedAt   = row.supportEndedAt;
  if (row.returnAt)         timeline.returnAt         = row.returnAt;
  return timeline;
}

function parseJson(value: any) {
  if (!value) return null;
  try {
    return JSON.parse(typeof value === 'string' ? value : value.toString());
  } catch (_) {
    return value;
  }
}

function normalizeHistoryRow(row: any) {
  const { departureAt, supportStartedAt, supportEndedAt, returnAt, parsedJson, ...rest } = row;
  return { ...rest, parsedJson: parseJson(parsedJson), timeline: rowToTimeline(row) };
}

function serializeParsedJson(payload: any, metricCandidates: any[]) {
  const parsed = payload.parsedJson ?? payload.aiParsed ?? null;
  if (!parsed && !metricCandidates.length) return null;
  const value = parsed && typeof parsed === 'object'
    ? { ...parsed, metricCandidates }
    : { parsed, metricCandidates };
  return JSON.stringify(value);
}

function toNumberOrNull(value: any): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseCollectedAt(value: any): Date {
  if (!value) return new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function normalizeMetricStatus(candidate: any): 'ok' | 'warn' | 'crit' {
  const raw = String(candidate?.status || candidate?.severity || '').toLowerCase();
  if (raw === 'crit' || raw === 'critical') return 'crit';
  if (raw === 'warn' || raw === 'warning' || raw === 'watch') return 'warn';
  return 'ok';
}

async function saveMetricCandidates(connection: any, historyId: string, candidates: any[] = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) return;
  const samples: MetricSampleInsert[] = [];
  for (const candidate of candidates) {
    if (candidate?.selected === false) continue;
    const targetId = toNullableInt(candidate?.targetId);
    const metricId = nullableText(candidate?.metricId);
    const value = toNumberOrNull(candidate?.value);
    if (!metricId || value == null) continue;
    if (!targetId) {
      throw validationError(`Metric target is required: ${candidate?.label || metricId}`);
    }
    samples.push({
      targetId,
      metricId,
      dimensionKey: nullableText(candidate?.dimensionKey),
      dimensionValue: nullableText(candidate?.dimensionValue),
      rawLabel: nullableText(candidate?.rawLabel || candidate?.label),
      collectedAt: parseCollectedAt(candidate?.collectedAt),
      value,
      status: normalizeMetricStatus(candidate),
      source: 'report-parse' as const,
      sourceRef: historyId,
    });
  }
  if (samples.length > 0) await insertSamplesBatch(connection, samples);
}

// ── 목록 조회 ─────────────────────────────────────────────────────────────────

export async function listHistories(connection: any, filters: any = {}) {
  const conditions = ['sh.ENABLED = 1'];
  const binds: any = {};

  if (filters.customerId) {
    conditions.push('sh.CUSTOMER_ID = :cust_id');
    binds.cust_id = Number(filters.customerId);
  }
  if (filters.engineerId) {
    conditions.push(
      'EXISTS (SELECT 1 FROM SUPPORT_HISTORY_PARTICIPANTS shp WHERE shp.HISTORY_ID = sh.HISTORY_ID AND shp.USER_ID = :eng_id)',
    );
    binds.eng_id = Number(filters.engineerId);
  }
  if (filters.from) {
    conditions.push(`sh.SUPPORT_STARTED_AT >= TO_TIMESTAMP(:from_dt, 'YYYY-MM-DD"T"HH24:MI')`);
    binds.from_dt = filters.from;
  }
  if (filters.to) {
    conditions.push(`sh.SUPPORT_STARTED_AT < TO_TIMESTAMP(:to_dt, 'YYYY-MM-DD"T"HH24:MI') + 1`);
    binds.to_dt = filters.to;
  }
  if (filters.type) {
    conditions.push('sh.HISTORY_TYPE = :htype');
    binds.htype = filters.type;
  }
  if (filters.method || filters.supportMode) {
    conditions.push('sh.SUPPORT_MODE = :smode');
    binds.smode = filters.method || filters.supportMode;
  }
  if (filters.status) {
    conditions.push('sh.STATUS = :status');
    binds.status = filters.status;
  }
  if (filters.q) {
    conditions.push('(UPPER(sh.SUMMARY) LIKE UPPER(:q) OR UPPER(sh.SERVICE_NAME) LIKE UPPER(:q))');
    binds.q = `%${filters.q}%`;
  }
  if (filters.workspaceId != null && filters.workspaceId !== '') {
    conditions.push('sh.WORKSPACE_ID = :workspace_id');
    binds.workspace_id = Number(filters.workspaceId);
  }
  const serverIds: number[] = Array.isArray(filters.serverIds)
    ? filters.serverIds.map((s: any) => Number(s)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];
  if (serverIds.length > 0) {
    const placeholders = serverIds.map((_, i) => `:srv${i}`).join(', ');
    serverIds.forEach((sid, i) => { binds[`srv${i}`] = sid; });
    conditions.push(`EXISTS (
      SELECT 1 FROM SUPPORT_HISTORY_TARGETS t
       WHERE t.HISTORY_ID = sh.HISTORY_ID
         AND t.SERVER_ID IN (${placeholders})
    )`);
  }

  const where = conditions.join(' AND ');
  const fullSql = `${sql('selectHistory.sql')} WHERE ${where} ORDER BY COALESCE(sh.SUPPORT_STARTED_AT, sh.DEPARTURE_AT) DESC`;

  const result = await connection.execute(fullSql, binds, { fetchTypeHandler: clobFetchHandler });

  const rows = (result.rows || []).map(normalizeHistoryRow);
  if (rows.length > 0) {
    const targetsMap = await fetchTargetsForHistories(connection, rows.map((r: any) => r.id));
    for (const row of rows) {
      row.targets = targetsMap.get(String(row.id)) || [];
    }
  }
  return rows;
}

// ── 단건 조회 ─────────────────────────────────────────────────────────────────

export async function findHistoryById(connection: any, historyId: string) {
  const fullSql = `${sql('selectHistory.sql')} WHERE sh.HISTORY_ID = :hid AND sh.ENABLED = 1`;
  const result = await connection.execute(fullSql, { hid: historyId }, { fetchTypeHandler: clobFetchHandler });

  const row = result.rows?.[0];
  if (!row) return null;

  const participants = await fetchParticipants(connection, historyId);
  const targets = await listHistoryTargets(connection, historyId);
  return { ...normalizeHistoryRow(row), participants, targets };
}

// ── 생성 ──────────────────────────────────────────────────────────────────────

export async function createHistory(connection: any, payload: any = {}) {
  const customerId = toNullableInt(payload.customerId);
  if (!customerId) throw validationError('고객사는 필수 항목입니다');
  const serviceName  = requiredText(payload.service || payload.serviceName, '서비스명');
  const historyType  = requiredText(payload.type || payload.historyType,    '지원 유형');
  const supportMode  = requiredText(payload.supportMode, '지원 방식');
  const status       = nullableText(payload.status) || 'draft';
  const priority     = nullableText(payload.priority) || 'p3';
  const documentKind = nullableText(payload.documentKind);
  const aiConfidence = toNumberOrNull(payload.aiConfidence);
  const summary      = nullableClob(payload.summary);
  const workDetail   = nullableClob(payload.workDetail);
  const finding      = nullableClob(payload.finding);
  const actionResult = nullableClob(payload.action || payload.actionResult);
  const metricCandidates = Array.isArray(payload.metricCandidates) ? payload.metricCandidates : [];
  const parsedJson = nullableClob(serializeParsedJson(payload, metricCandidates));
  const createdBy    = toNullableInt(payload.createdBy);
  const workspaceId  = toNullableInt(payload.workspaceId);
  const serverIds: number[] = Array.isArray(payload.serverIds)
    ? payload.serverIds.map((s: any) => Number(s)).filter((n: number) => Number.isFinite(n) && n > 0)
    : (Array.isArray(payload.targets)
        ? payload.targets.map((t: any) => Number(t?.serverId ?? t)).filter((n: number) => Number.isFinite(n) && n > 0)
        : []);

  const tl         = payload.timeline || {};
  const depAt      = nullableText(tl.departureAt);
  const startedAt  = nullableText(tl.supportStartedAt || payload.supportStartedAt);
  const endedAt    = nullableText(tl.supportEndedAt   || payload.supportEndedAt);
  const returnAt   = nullableText(tl.returnAt);

  const historyId = payload.id && String(payload.id).startsWith('H-')
    ? String(payload.id)
    : generateHistoryId();

  const insertSql = sql('insertHistory.sql')
    .replace(':dep_at', depAt ? `TO_TIMESTAMP(:dep_at_val, 'YYYY-MM-DD"T"HH24:MI')` : 'NULL')
    .replace(':start_at', startedAt ? `TO_TIMESTAMP(:start_at_val, 'YYYY-MM-DD"T"HH24:MI')` : 'NULL')
    .replace(':end_at', endedAt ? `TO_TIMESTAMP(:end_at_val, 'YYYY-MM-DD"T"HH24:MI')` : 'NULL')
    .replace(':ret_at', returnAt ? `TO_TIMESTAMP(:ret_at_val, 'YYYY-MM-DD"T"HH24:MI')` : 'NULL');

  await connection.execute(insertSql, {
    hid: historyId, cust_id: customerId, svc: serviceName,
    htype: historyType, smode: supportMode,
    status, priority, document_kind: documentKind, ai_confidence: aiConfidence,
    summary, work_detail: workDetail,
    finding, action_result: actionResult, parsed_json: parsedJson,
    workspace_id: workspaceId,
    ...(depAt     ? { dep_at_val:   depAt }     : {}),
    ...(startedAt ? { start_at_val: startedAt } : {}),
    ...(endedAt   ? { end_at_val:   endedAt }   : {}),
    ...(returnAt  ? { ret_at_val:   returnAt }  : {}),
    created_by: createdBy,
  });

  const participants = Array.isArray(payload.participants) ? payload.participants : [];
  const managerId    = payload.managerId ?? payload.manager?.id ?? null;
  await replaceParticipants(connection, historyId, participants, managerId);
  await saveMetricCandidates(connection, historyId, metricCandidates);
  if (serverIds.length > 0) {
    await setHistoryTargets(connection, historyId, serverIds);
  }

  return findHistoryById(connection, historyId);
}

// ── 수정 ──────────────────────────────────────────────────────────────────────

export async function updateHistory(connection: any, historyId: string, payload: any = {}) {
  const current = await findHistoryById(connection, historyId);
  if (!current) throw notFoundError('지원이력을 찾을 수 없습니다');

  const tl        = has(payload, 'timeline') ? (payload.timeline || {}) : (current.timeline || {});
  const depAt     = nullableText(tl.departureAt);
  const startedAt = nullableText(tl.supportStartedAt);
  const endedAt   = nullableText(tl.supportEndedAt);
  const returnAt  = nullableText(tl.returnAt);

  const updateSql = sql('updateHistory.sql')
    .replace(':dep_at', depAt ? `TO_TIMESTAMP(:dep_at_val, 'YYYY-MM-DD"T"HH24:MI')` : 'NULL')
    .replace(':start_at', startedAt ? `TO_TIMESTAMP(:start_at_val, 'YYYY-MM-DD"T"HH24:MI')` : 'NULL')
    .replace(':end_at', endedAt ? `TO_TIMESTAMP(:end_at_val, 'YYYY-MM-DD"T"HH24:MI')` : 'NULL')
    .replace(':ret_at', returnAt ? `TO_TIMESTAMP(:ret_at_val, 'YYYY-MM-DD"T"HH24:MI')` : 'NULL');

  const t = (k: string, cur: any) => has(payload, k) ? payload[k] : cur;
  const nextParsedJson = has(payload, 'parsedJson') || has(payload, 'metricCandidates')
    ? serializeParsedJson(payload, Array.isArray(payload.metricCandidates) ? payload.metricCandidates : [])
    : (current.parsedJson ? JSON.stringify(current.parsedJson) : null);

  await connection.execute(updateSql, {
    hid: historyId,
    cust_id:      toNullableInt(t('customerId', current.customerId)),
    svc:          nullableText(t('service', current.service)) || current.service,
    htype:        nullableText(t('type', current.type)) || current.type,
    smode:        nullableText(t('supportMode', current.supportMode)) || current.supportMode,
    status:       nullableText(t('status', current.status)) || 'draft',
    priority:     nullableText(t('priority', current.priority)) || 'p3',
    document_kind:nullableText(t('documentKind', current.documentKind)),
    ai_confidence:toNumberOrNull(t('aiConfidence', current.aiConfidence)),
    summary:      nullableClob(t('summary', current.summary)),
    work_detail:  nullableClob(t('workDetail', current.workDetail)),
    finding:      nullableClob(t('finding', current.finding)),
    action_result:nullableClob(t('action', current.action)),
    parsed_json:  nullableClob(nextParsedJson),
    workspace_id: toNullableInt(t('workspaceId', current.workspaceId)),
    ...(depAt     ? { dep_at_val:   depAt }     : {}),
    ...(startedAt ? { start_at_val: startedAt } : {}),
    ...(endedAt   ? { end_at_val:   endedAt }   : {}),
    ...(returnAt  ? { ret_at_val:   returnAt }  : {}),
  });

  if (has(payload, 'participants')) {
    const managerId = payload.managerId ?? payload.manager?.id ?? null;
    await replaceParticipants(connection, historyId, payload.participants, managerId);
  }

  if (has(payload, 'serverIds') || has(payload, 'targets')) {
    const ids: number[] = Array.isArray(payload.serverIds)
      ? payload.serverIds.map((s: any) => Number(s)).filter((n: number) => Number.isFinite(n) && n > 0)
      : (Array.isArray(payload.targets)
          ? payload.targets.map((t: any) => Number(t?.serverId ?? t)).filter((n: number) => Number.isFinite(n) && n > 0)
          : []);
    await setHistoryTargets(connection, historyId, ids);
  }

  return findHistoryById(connection, historyId);
}

// ── 비활성화 ──────────────────────────────────────────────────────────────────

export async function deleteHistory(connection: any, historyId: string) {
  const current = await findHistoryById(connection, historyId);
  if (!current) throw notFoundError('지원이력을 찾을 수 없습니다');
  await connection.execute(sql('deleteHistory.sql'), { hid: historyId });
  return { id: historyId, deleted: true };
}

export async function bulkDeleteHistories(connection: any, ids: string[]) {
  if (!Array.isArray(ids) || ids.length === 0) throw validationError('ID 목록이 비어 있습니다');
  for (const id of ids) {
    await connection.execute(sql('deleteHistory.sql'), { hid: String(id) });
  }
  return { deleted: ids.length };
}

// ── 일괄 상태 변경 ────────────────────────────────────────────────────────────

export async function bulkUpdateStatus(connection: any, ids: string[], status: string) {
  if (!Array.isArray(ids) || ids.length === 0) throw validationError('ID 목록이 비어 있습니다');
  const validStatus = nullableText(status);
  if (!validStatus) throw validationError('변경할 상태값이 필요합니다');

  for (const id of ids) {
    await connection.execute(sql('updateHistoryStatus.sql'), { status: validStatus, hid: String(id) });
  }
  return { updated: ids.length, status: validStatus };
}
