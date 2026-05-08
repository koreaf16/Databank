/**
 * 파일: backend/src/modules/matrix/repository/matrixRepository.ts
 * 역할: ROUTINE_PLANS + ROUTINE_PLAN_CELLS CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import oracledb from 'oracledb';
import {
  nullableText,
  notFoundError,
  loadSql,
} from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

function parseCells(cellsRaw: string | null) {
  if (!cellsRaw) return [];
  return cellsRaw.split(',').filter(Boolean).map(part => {
    const [m, s, h] = part.split(':');
    return { month: Number(m), status: s || 'pending', historyId: h || null };
  });
}

function normalizePlan(row: any) {
  const { cellsRaw, ...rest } = row;
  return { ...rest, cells: parseCells(cellsRaw) };
}

// ── 목록 조회 ─────────────────────────────────────────────────────────────────

export async function listPlans(connection: any, options: any = {}) {
  const { year, half, scope, userId } = options;
  const conditions = ['p.ENABLED = 1'];
  const binds: any = {};

  if (year) { conditions.push('p.PERIOD_YEAR = :year'); binds.year = Number(year); }
  if (half) { conditions.push('p.PERIOD_HALF = :half'); binds.half = Number(half); }

  if (scope === 'me' && userId) {
    conditions.push(
      'p.CUSTOMER_ID IN (SELECT CUSTOMER_ID FROM CUSTOMER_ASSIGNMENTS WHERE USER_ID = :usrId)',
    );
    binds.usrId = Number(userId);
  }

  const where = conditions.join(' AND ');
  const fullSql = `${sql('selectPlans.sql')} WHERE ${where} ORDER BY c.CUSTOMER_MAIN`;

  const result = await connection.execute(fullSql, binds);
  return (result.rows || []).map(normalizePlan);
}

// ── 단건 조회 ─────────────────────────────────────────────────────────────────

export async function findPlanById(connection: any, planId: number) {
  const fullSql = `${sql('selectPlans.sql')} WHERE p.PLAN_ID = :pid AND p.ENABLED = 1`;
  const result = await connection.execute(fullSql, { pid: Number(planId) });
  const row = result.rows?.[0];
  return row ? normalizePlan(row) : null;
}

// ── 생성 ──────────────────────────────────────────────────────────────────────

export async function createPlan(connection: any, payload: any = {}) {
  const result = await connection.execute(sql('insertPlan.sql'), {
    cid:    Number(payload.customerId),
    svc:    String(payload.serviceName || '정기점검'),
    yr:     Number(payload.year || new Date().getFullYear()),
    half:   Number(payload.half || 1),
    freq:   nullableText(payload.targetFreq),
    new_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
  });
  return findPlanById(connection, result.outBinds.new_id[0]);
}

// ── 수정 ──────────────────────────────────────────────────────────────────────

export async function updatePlan(connection: any, planId: number, payload: any = {}) {
  const current = await findPlanById(connection, planId);
  if (!current) throw notFoundError('플랜을 찾을 수 없습니다');

  const h = (k: string) => Object.prototype.hasOwnProperty.call(payload, k);
  await connection.execute(sql('updatePlan.sql'), {
    pid:  Number(planId),
    svc:  h('serviceName')  ? String(payload.serviceName)       : current.serviceName,
    freq: h('targetFreq')   ? nullableText(payload.targetFreq)  : nullableText(current.targetFreq),
  });
  return findPlanById(connection, planId);
}

// ── 비활성화 ──────────────────────────────────────────────────────────────────

export async function deletePlan(connection: any, planId: number) {
  const current = await findPlanById(connection, planId);
  if (!current) throw notFoundError('플랜을 찾을 수 없습니다');
  await connection.execute(sql('deletePlan.sql'), { pid: Number(planId) });
  return { planId: Number(planId), deleted: true };
}

// ── 셀 상태 변경 (UPSERT) ─────────────────────────────────────────────────────

export async function updateCell(connection: any, planId: number, month: number, payload: any = {}) {
  const plan = await findPlanById(connection, planId);
  if (!plan) throw notFoundError('플랜을 찾을 수 없습니다');

  const status   = String(payload.status || 'pending');
  const histId   = nullableText(payload.historyId);
  const pid      = Number(planId);
  const mon      = Number(month);

  const upd = await connection.execute(sql('updateCell.sql'), { pid, mon, status, hist_id: histId });

  if (upd.rowsAffected === 0) {
    await connection.execute(sql('insertCell.sql'), { pid, mon, status, hist_id: histId });
  }

  return findPlanById(connection, planId);
}
