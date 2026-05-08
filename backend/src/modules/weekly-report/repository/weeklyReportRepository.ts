/**
 * 파일: backend/src/modules/weekly-report/repository/weeklyReportRepository.ts
 * 역할: WEEKLY_REPORTS + WEEKLY_REPORT_ITEMS CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import oracledb from 'oracledb';
import {
  requiredText,
  nullableText,
  nullableClob,
  toNullableInt,
  clobFetchHandler,
  notFoundError,
  loadSql,
  has,
} from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

// ── 목록 조회 ─────────────────────────────────────────────────────────────────

export async function listReports(connection: any, filters: any = {}) {
  const { weekStart, teamId } = filters;
  const conditions: string[] = [];
  const binds: any = {};

  if (weekStart) {
    conditions.push(`TRUNC(wr.WEEK_START) = TO_DATE(:ws, 'YYYY-MM-DD')`);
    binds.ws = weekStart;
  }
  if (teamId != null) {
    conditions.push('wr.TEAM_ID = :team_id');
    binds.team_id = Number(teamId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const fullSql = `${sql('selectReports.sql')} ${where} ORDER BY wr.WEEK_START DESC`;

  const result = await connection.execute(fullSql, binds);
  return result.rows || [];
}

// ── 단건 조회 ─────────────────────────────────────────────────────────────────

export async function findReportById(connection: any, reportId: number | string) {
  const fullSql = `${sql('selectReports.sql')} WHERE wr.REPORT_ID = :rid`;
  const result = await connection.execute(
    fullSql,
    { rid: Number(reportId) },
    { fetchTypeHandler: clobFetchHandler },
  );
  const row = result.rows?.[0];
  if (!row) return null;
  try { row.payload = row.payload ? JSON.parse(row.payload) : null; } catch (_) {}
  return row;
}

// ── 생성 ──────────────────────────────────────────────────────────────────────

export async function createReport(connection: any, payload: any = {}) {
  const payloadJson = payload.payload != null ? JSON.stringify(payload.payload) : null;
  const result = await connection.execute(sql('insertReport.sql'), {
    team_id:    toNullableInt(payload.teamId),
    ws:         String(payload.weekStart || ''),
    we:         String(payload.weekEnd   || ''),
    status:     nullableText(payload.status) || 'draft',
    created_by: toNullableInt(payload.createdBy),
    tmpl:       nullableText(payload.templateId),
    payload:    nullableClob(payloadJson),
    new_id:     { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
  });
  return findReportById(connection, result.outBinds.new_id[0]);
}

// ── 수정 ──────────────────────────────────────────────────────────────────────

export async function updateReport(connection: any, reportId: number | string, payload: any = {}) {
  const current = await findReportById(connection, reportId);
  if (!current) throw notFoundError('보고서를 찾을 수 없습니다');

  const payloadJson = has(payload, 'payload') && payload.payload != null ? JSON.stringify(payload.payload) : null;

  await connection.execute(sql('updateReport.sql'), {
    rid:     Number(reportId),
    status:  has(payload, 'status') ? String(payload.status) : current.status,
    payload: has(payload, 'payload') ? nullableClob(payloadJson) : nullableClob(null),
  });
  return findReportById(connection, reportId);
}

export async function createReportFromHistory(connection: any, payload: any = {}) {
  const historyId = requiredText(payload.historyId, 'historyId');
  const history = await fetchHistoryForReport(connection, historyId);
  if (!history) throw notFoundError('지원이력을 찾을 수 없습니다');

  const metrics = await fetchMetricsForHistory(connection, historyId);
  const week = resolveReportWeek(payload, history.supportStartedAt || history.createdAt);
  const teamId = toNullableInt(payload.teamId);
  const reportPayload = buildHistoryReportPayload(history, metrics, week, payload);

  if (teamId != null) {
    const existing = await listReports(connection, { weekStart: week.weekStart, teamId });
    if (existing[0]?.id) {
      const current = await findReportById(connection, existing[0].id);
      const nextPayload = mergeReportPayload(current?.payload, reportPayload);
      return updateReport(connection, existing[0].id, {
        status: payload.status || current?.status || 'draft',
        payload: nextPayload,
      });
    }
  }

  return createReport(connection, {
    teamId,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    status: payload.status || 'draft',
    createdBy: toNullableInt(payload.createdBy),
    templateId: nullableText(payload.templateId),
    payload: reportPayload,
  });
}

async function fetchHistoryForReport(connection: any, historyId: string) {
  const result = await connection.execute(
    `SELECT sh.HISTORY_ID AS "id",
            sh.CUSTOMER_ID AS "customerId",
            c.CUSTOMER_MAIN AS "customer",
            sh.SERVICE_NAME AS "service",
            sh.HISTORY_TYPE AS "type",
            sh.SUPPORT_MODE AS "supportMode",
            sh.PRIORITY AS "priority",
            sh.DOCUMENT_KIND AS "documentKind",
            sh.AI_CONFIDENCE AS "aiConfidence",
            sh.SUMMARY AS "summary",
            sh.WORK_DETAIL AS "workDetail",
            sh.FINDING AS "finding",
            sh.ACTION_RESULT AS "action",
            sh.PARSED_JSON AS "parsedJson",
            TO_CHAR(sh.SUPPORT_STARTED_AT, 'YYYY-MM-DD"T"HH24:MI') AS "supportStartedAt",
            TO_CHAR(sh.SUPPORT_ENDED_AT, 'YYYY-MM-DD"T"HH24:MI') AS "supportEndedAt",
            TO_CHAR(sh.CREATED_AT, 'YYYY-MM-DD"T"HH24:MI') AS "createdAt"
     FROM SUPPORT_HISTORIES sh
     JOIN CUSTOMERS c ON c.CUSTOMER_ID = sh.CUSTOMER_ID
     WHERE sh.HISTORY_ID = :historyId AND sh.ENABLED = 1`,
    { historyId },
    { fetchTypeHandler: clobFetchHandler },
  );
  const row = result.rows?.[0];
  if (!row) return null;
  try { row.parsedJson = row.parsedJson ? JSON.parse(row.parsedJson) : null; } catch (_) {}
  return row;
}

async function fetchMetricsForHistory(connection: any, historyId: string) {
  const result = await connection.execute(
    `SELECT s.TARGET_ID AS "targetId",
            t.NAME AS "targetName",
            t.SYSTEM_TYPE AS "systemType",
            s.METRIC_ID AS "metricId",
            d.NAME AS "metricName",
            d.UNIT AS "unit",
            s.DIMENSION_KEY AS "dimensionKey",
            s.DIMENSION_VALUE AS "dimensionValue",
            s.RAW_LABEL AS "rawLabel",
            s.VALUE AS "value",
            s.STATUS AS "status",
            s.SOURCE_REF AS "sourceRef",
            TO_CHAR(s.COLLECTED_AT, 'YYYY-MM-DD"T"HH24:MI') AS "collectedAt"
     FROM METRIC_SAMPLES s
     JOIN MONITOR_TARGETS t ON t.TARGET_ID = s.TARGET_ID
     JOIN METRIC_DEFINITIONS d ON d.METRIC_ID = s.METRIC_ID
     WHERE s.SOURCE = 'report-parse'
       AND s.SOURCE_REF = :historyId
     ORDER BY DECODE(s.STATUS, 'crit', 1, 'warn', 2, 'ok', 3, 4), s.METRIC_ID, s.DIMENSION_VALUE`,
    { historyId },
  );
  return result.rows || [];
}

function resolveReportWeek(payload: any, baseValue: string | null) {
  if (payload.weekStart && payload.weekEnd) {
    return { weekStart: String(payload.weekStart), weekEnd: String(payload.weekEnd) };
  }
  const base = baseValue ? new Date(baseValue) : new Date();
  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    weekStart: toDateOnly(monday),
    weekEnd: toDateOnly(sunday),
  };
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildHistoryReportPayload(history: any, metrics: any[], week: any, payload: any) {
  const metricLines = metrics.length
    ? metrics.map(m => `- ${m.rawLabel || m.dimensionValue || m.metricName}: ${m.value}${m.unit || ''} (${m.status})`).join('\n')
    : '- No parsed metric samples were saved.';

  const generatedBody = [
    `# ${history.customer} ${history.service} report`,
    '',
    `## Summary`,
    history.summary || '-',
    '',
    `## Work details`,
    history.workDetail || '-',
    '',
    `## Findings`,
    history.finding || '-',
    '',
    `## Actions`,
    history.action || '-',
    '',
    `## Metrics`,
    metricLines,
  ].join('\n');

  return {
    source: 'support-history',
    title: payload.title || `${history.customer} ${history.service} operational report`,
    generatedAt: new Date().toISOString(),
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    histories: [{
      id: history.id,
      customerId: history.customerId,
      customer: history.customer,
      service: history.service,
      type: history.type,
      supportMode: history.supportMode,
      documentKind: history.documentKind,
      summary: history.summary,
      workDetail: history.workDetail,
      finding: history.finding,
      action: history.action,
      parsedJson: history.parsedJson,
    }],
    metrics,
    generatedBody,
    editedBody: generatedBody,
    documentMeta: {
      customer: history.customer,
      service: history.service,
      period: `${week.weekStart} ~ ${week.weekEnd}`,
      status: 'draft',
      owner: payload.owner || '',
    },
  };
}

function mergeReportPayload(current: any, addition: any) {
  const base = current && typeof current === 'object' ? current : {};
  const existingHistories = Array.isArray(base.histories) ? base.histories : [];
  const existingMetrics = Array.isArray(base.metrics) ? base.metrics : [];
  const nextHistories = [
    ...existingHistories.filter((h: any) => h.id !== addition.histories?.[0]?.id),
    ...(addition.histories || []),
  ];
  const nextMetrics = [
    ...existingMetrics.filter((m: any) => m.sourceRef !== addition.histories?.[0]?.id),
    ...(addition.metrics || []),
  ];
  return {
    ...base,
    ...addition,
    histories: nextHistories,
    metrics: nextMetrics,
  };
}
