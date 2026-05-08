/**
 * 파일: backend/src/modules/customers/repository/customerRepository.ts
 * 역할: 고객사(CUSTOMERS + CUSTOMER_ALIASES + CUSTOMER_ASSIGNMENTS) 테이블 CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import oracledb from 'oracledb';
import {
  requiredText,
  requiredId,
  nullableText,
  toFlag,
  notFoundError,
  conflictError,
  isUniqueError,
  loadSql,
  has,
} from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

// ── 목록 조회 ─────────────────────────────────────────────────────────────────

export async function listCustomers(connection: any, options: any = {}) {
  const enabledOnly = options.enabledOnly !== false;
  const q = String(options.q || '').trim();
  const assignedTo = toNullableNumber(options.assignedTo ?? options.assignedUserId);
  const limit = Math.max(0, Math.min(toNullableNumber(options.limit) ?? 0, 100));

  const conditions = ['(:enabled_only = 0 OR c.ENABLED = 1)'];
  const binds: Record<string, any> = { enabled_only: enabledOnly ? 1 : 0 };

  if (q) {
    conditions.push(`(
      UPPER(c.CUSTOMER_MAIN) LIKE UPPER(:q)
      OR EXISTS (
        SELECT 1
        FROM CUSTOMER_ALIASES ca
        WHERE ca.CUSTOMER_ID = c.CUSTOMER_ID
          AND UPPER(ca.ALIAS_NAME) LIKE UPPER(:q)
      )
    )`);
    binds.q = `%${q}%`;
  }

  if (assignedTo != null) {
    conditions.push(`EXISTS (
      SELECT 1
      FROM CUSTOMER_ASSIGNMENTS a
      WHERE a.CUSTOMER_ID = c.CUSTOMER_ID
        AND a.USER_ID = :assigned_to
        AND a.ENABLED = 1
    )`);
    binds.assigned_to = assignedTo;
  }

  const customerResult = await connection.execute(`
    SELECT c.CUSTOMER_ID AS "id", c.CUSTOMER_MAIN AS "customerMain", c.ENABLED AS "enabled"
    FROM CUSTOMERS c
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.CUSTOMER_MAIN, c.CUSTOMER_ID
  `, binds);

  const customers = limit > 0 ? (customerResult.rows || []).slice(0, limit) : (customerResult.rows || []);
  if (!customers.length) return [];

  const aliasResult = await connection.execute(sql('listAllAliases.sql'));

  const aliasMap: Record<number, string[]> = {};
  for (const row of aliasResult.rows || []) {
    if (!aliasMap[row.customerId]) aliasMap[row.customerId] = [];
    aliasMap[row.customerId].push(row.name);
  }

  return customers.map((c: any) => ({ ...c, aliases: aliasMap[c.id] || [] }));
}

function toNullableNumber(value: any): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ── 단건 조회 ─────────────────────────────────────────────────────────────────

export async function findCustomerById(connection: any, customerId: number) {
  const result = await connection.execute(sql('findCustomerById.sql'), { id: customerId });
  const customer = result.rows?.[0] || null;
  if (!customer) return null;

  const aliasResult = await connection.execute(sql('findCustomerAliases.sql'), { id: customerId });
  customer.aliases = aliasResult.rows || [];

  const assignResult = await connection.execute(sql('findCustomerAssignments.sql'), { id: customerId });
  customer.assignments = assignResult.rows || [];

  return customer;
}

// ── 생성 ──────────────────────────────────────────────────────────────────────

export async function createCustomer(connection: any, payload: any = {}) {
  const customerMain = requiredText(payload.customerMain, '고객사명');
  const aliases = toAliasArray(payload.aliases);
  const nextId = await nextCustomerId(connection);

  await connection.execute(sql('createCustomer.sql'), {
    id: nextId,
    customer_main: customerMain,
    enabled: toFlag(payload.enabled, true),
  });
  await replaceAliases(connection, nextId, aliases);
  return findCustomerById(connection, nextId);
}

// ── 수정 ──────────────────────────────────────────────────────────────────────

export async function updateCustomer(connection: any, customerId: number, payload: any = {}) {
  const id = requiredId(customerId, '고객사 ID가 유효하지 않습니다');
  const current = await findCustomerById(connection, id);
  if (!current) throw notFoundError('고객사를 찾을 수 없습니다');

  const nextMain = has(payload, 'customerMain') ? requiredText(payload.customerMain, '고객사명') : current.customerMain;
  const nextEnabled = has(payload, 'enabled') ? toFlag(payload.enabled) : current.enabled;

  await connection.execute(sql('updateCustomer.sql'), {
    id,
    customer_main: nextMain,
    enabled: nextEnabled,
  });
  if (has(payload, 'aliases')) await replaceAliases(connection, id, toAliasArray(payload.aliases));
  return findCustomerById(connection, id);
}

// ── 비활성화 ──────────────────────────────────────────────────────────────────

export async function deleteCustomer(connection: any, customerId: number) {
  const id = requiredId(customerId, '고객사 ID가 유효하지 않습니다');
  const current = await findCustomerById(connection, id);
  if (!current) throw notFoundError('고객사를 찾을 수 없습니다');

  await connection.execute(sql('deleteCustomer.sql'), { id });
  return findCustomerById(connection, id);
}

// ── 별칭 단건 추가 ────────────────────────────────────────────────────────────

export async function addAlias(connection: any, customerId: number, aliasName: string) {
  const id = requiredId(customerId);
  const name = requiredText(aliasName, '별칭');
  const sortResult = await connection.execute(sql('getNextAliasSortOrder.sql'), { id });
  const sortOrder = sortResult.rows?.[0]?.next ?? 0;

  try {
    await connection.execute(sql('insertAlias.sql'), {
      id,
      name,
      sort_order: sortOrder,
    });
  } catch (err) {
    if (isUniqueError(err)) throw conflictError('이미 등록된 별칭입니다');
    throw err;
  }
  const result = await connection.execute(sql('findCustomerAliases.sql'), { id });
  return result.rows || [];
}

// ── 별칭 단건 삭제 ────────────────────────────────────────────────────────────

export async function removeAlias(connection: any, customerId: number, aliasId: number) {
  const cid = requiredId(customerId);
  const aid = requiredId(aliasId, '별칭 ID가 유효하지 않습니다');

  const check = await connection.execute(sql('checkAliasExists.sql'), { aid, cid });
  if (!check.rows?.length) throw notFoundError('별칭을 찾을 수 없습니다');

  await connection.execute(sql('deleteAliasById.sql'), { aid });
  const result = await connection.execute(sql('findCustomerAliases.sql'), { id: cid });
  return result.rows || [];
}

// ── 담당자 목록 조회 ──────────────────────────────────────────────────────────

export async function listAssignments(connection: any, customerId: number) {
  const id = requiredId(customerId);
  const result = await connection.execute(sql('findCustomerAssignments.sql'), { id });
  return result.rows || [];
}

// ── 담당자 추가 ───────────────────────────────────────────────────────────────

export async function addAssignment(connection: any, customerId: number, payload: any = {}) {
  const cid = requiredId(customerId);
  const userId = requiredId(payload.userId, '사용자 ID가 유효하지 않습니다');
  const role = nullableText(payload.role) || 'secondary';

  try {
    const insertResult = await connection.execute(sql('addAssignment.sql'), {
      cid,
      user_id: userId,
      role,
      out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    });
    const newId = insertResult.outBinds?.out_id?.[0];
    return { assignmentId: newId, customerId: cid, userId, role };
  } catch (err) {
    if (isUniqueError(err)) throw conflictError('이미 배정된 담당자 및 역할입니다');
    throw err;
  }
}

// ── 담당자 제거 ───────────────────────────────────────────────────────────────

export async function removeAssignment(connection: any, customerId: number, assignmentId: number) {
  const cid = requiredId(customerId);
  const aid = requiredId(assignmentId, '배정 ID가 유효하지 않습니다');

  const check = await connection.execute(sql('checkAssignmentExists.sql'), { aid, cid });
  if (!check.rows?.length) throw notFoundError('배정 정보를 찾을 수 없습니다');

  await connection.execute(sql('disableAssignmentById.sql'), { aid });
  return { assignmentId: aid, removed: true };
}

// ── 내부 유틸 ─────────────────────────────────────────────────────────────────

async function replaceAliases(connection: any, customerId: number, aliases: string[]) {
  await connection.execute(sql('deleteAllAliasesByCustomerId.sql'), { id: customerId });
  for (let i = 0; i < aliases.length; i++) {
    await connection.execute(sql('insertAlias.sql'), {
      id: customerId,
      name: aliases[i],
      sort_order: i,
    });
  }
}

function toAliasArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(v => String(v ?? '').trim()).filter(Boolean);
}

async function nextCustomerId(connection: any) {
  const result = await connection.execute(sql('nextCustomerId.sql'));
  return result.rows?.[0]?.id || 1;
}
