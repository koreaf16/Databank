/**
 * 파일: backend/src/modules/settings/checklists/repository/checklistRepository.ts
 * 역할: CHECKLIST_TEMPLATES 테이블 CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import oracledb from 'oracledb';
import {
  clobFetchHandler,
  requiredText,
  nullableText,
  toInt,
  toFlag,
  has,
  toOptional,
  validationError,
  notFoundError,
  loadSql,
} from '../../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

const VALID_KIND   = new Set(['routine', 'install', 'incident', 'migration', 'other']);
const VALID_SCOPE  = new Set(['global', 'service', 'customer', 'customerService']);
const VALID_STATUS = new Set(['draft', 'active', 'archived']);

export async function listChecklists(connection: any, options: {
  status?: string;
  kind?: string;
  serviceMasterId?: string;
  customerId?: number | null;
  enabledOnly?: boolean;
} = {}) {
  const conditions: string[] = [];
  const binds: Record<string, unknown> = {};

  if (options.enabledOnly !== false) {
    conditions.push('ENABLED = 1');
  }
  if (options.status) {
    conditions.push('STATUS = :status');
    binds.status = options.status;
  }
  if (options.kind) {
    conditions.push('KIND = :kind');
    binds.kind = options.kind;
  }
  if (options.serviceMasterId) {
    conditions.push('SERVICE_MASTER_ID = :svcId');
    binds.svcId = options.serviceMasterId;
  }
  if (options.customerId != null) {
    conditions.push('CUSTOMER_ID = :custId');
    binds.custId = options.customerId;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const fullSql = `${sql('selectChecklist.sql')} ${where} ORDER BY STATUS, NAME`;

  const result = await connection.execute(fullSql, binds, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });

  return (result.rows || []).map(normalizeRow);
}

export async function findChecklistById(connection: any, templateId: number | string) {
  const id = toInt(templateId);
  if (!id) throw validationError('templateId가 유효하지 않습니다');

  const fullSql = `${sql('selectChecklist.sql')} WHERE TEMPLATE_ID = :id`;
  const result = await connection.execute(fullSql, { id }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });
  const row = result.rows?.[0] || null;
  return row ? normalizeRow(row) : null;
}

export async function createChecklist(connection: any, payload: any = {}) {
  const name   = requiredText(payload.name, 'name');
  const kind   = validateKind(nullableText(payload.kind) || 'routine');
  const scope  = validateScope(nullableText(payload.scope) || 'global');
  const status = validateStatus(nullableText(payload.status) || 'draft');

  const result = await connection.execute(sql('insertChecklist.sql'), {
    name,
    kind,
    scope,
    status,
    customer_id:   toInt(payload.customerId) ?? null,
    svc_master_id: nullableText(payload.serviceMasterId),
    version:       nullableText(payload.version) || 'v1.0',
    owner_id:      toInt(payload.ownerId) ?? null,
    sections_json: serializeSections(payload.sections),
    out_id:        { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
  });

  return await findChecklistById(connection, result.outBinds.out_id[0]);
}

export async function updateChecklist(connection: any, templateId: number | string, payload: any = {}) {
  const id = toInt(templateId);
  if (!id) throw validationError('templateId가 유효하지 않습니다');
  const current = await findChecklistById(connection, id);
  if (!current) throw notFoundError('체크리스트 템플릿을 찾을 수 없습니다');

  const newKind   = has(payload, 'kind')   ? validateKind(nullableText(payload.kind) || current.kind)   : current.kind;
  const newScope  = has(payload, 'scope')  ? validateScope(nullableText(payload.scope) || current.scope) : current.scope;
  const newStatus = has(payload, 'status') ? validateStatus(nullableText(payload.status) || current.status) : current.status;

  await connection.execute(sql('updateChecklist.sql'), {
    id,
    name:          has(payload, 'name')            ? requiredText(payload.name, 'name') : current.name,
    kind:          newKind,
    scope:         newScope,
    status:        newStatus,
    customer_id:   has(payload, 'customerId')      ? (toInt(payload.customerId) ?? null) : current.customerId,
    svc_master_id: toOptional(payload, 'serviceMasterId', current.serviceMasterId),
    version:       toOptional(payload, 'version',        current.version),
    owner_id:      has(payload, 'ownerId')         ? (toInt(payload.ownerId) ?? null) : current.ownerId,
    sections_json: has(payload, 'sections')        ? serializeSections(payload.sections) : serializeSections(current.sections),
    enabled:       has(payload, 'enabled')         ? toFlag(payload.enabled) : (current.enabled ? 1 : 0),
  });

  return await findChecklistById(connection, id);
}

export async function deleteChecklist(connection: any, templateId: number | string) {
  const id = toInt(templateId);
  if (!id) throw validationError('templateId가 유효하지 않습니다');
  const current = await findChecklistById(connection, id);
  if (!current) throw notFoundError('체크리스트 템플릿을 찾을 수 없습니다');

  await connection.execute(sql('deleteChecklist.sql'), { id });
  return { id, deleted: true };
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function normalizeRow(row: any) {
  let sections = [];
  try {
    sections = row.sectionsJson ? JSON.parse(row.sectionsJson) : [];
  } catch (_) {
    sections = [];
  }

  return {
    ...row,
    sections,
    enabled: row.enabled === 1,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

function serializeSections(val: any) {
  if (val == null) return null;
  if (typeof val === 'string') return val.trim() || null;
  return JSON.stringify(val);
}

function validateKind(v: string) {
  if (!VALID_KIND.has(v)) throw validationError('kind는 routine·install·incident·migration·other 중 하나여야 합니다');
  return v;
}

function validateScope(v: string) {
  if (!VALID_SCOPE.has(v)) throw validationError('scope는 global·service·customer·customerService 중 하나여야 합니다');
  return v;
}

function validateStatus(v: string) {
  if (!VALID_STATUS.has(v)) throw validationError('status는 draft·active·archived 중 하나여야 합니다');
  return v;
}
