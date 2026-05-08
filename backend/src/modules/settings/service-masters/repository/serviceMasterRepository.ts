/**
 * 파일: backend/src/modules/settings/service-masters/repository/serviceMasterRepository.ts
 * 역할: SERVICE_MASTERS 테이블 CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import oracledb from 'oracledb';
import {
  clobFetchHandler,
  requiredText,
  nullableText,
  nullableClob,
  toFlag,
  has,
  toOptional,
  validationError,
  notFoundError,
  loadSql,
} from '../../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

export async function listServiceMasters(connection: any, options: any = {}) {
  const enabledOnly = options.enabledOnly !== false;

  const where = enabledOnly ? 'WHERE ENABLED = 1' : 'WHERE (:enabled_only = 0 OR ENABLED = 1)';
  const fullSql = `${sql('selectServiceMaster.sql')} ${where} ORDER BY CATEGORY NULLS LAST, NAME`;
  const binds = enabledOnly ? {} : { enabled_only: 0 };

  const result = await connection.execute(
    fullSql,
    binds,
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchTypeHandler: clobFetchHandler },
  );

  return (result.rows || []).map(normalizeRow);
}

export async function findServiceMasterById(connection: any, masterId: string) {
  const id = String(masterId || '').trim();
  if (!id) return null;

  const fullSql = `${sql('selectServiceMaster.sql')} WHERE MASTER_ID = :id`;
  const result = await connection.execute(
    fullSql,
    { id },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchTypeHandler: clobFetchHandler },
  );
  const row = result.rows?.[0] || null;
  return row ? normalizeRow(row) : null;
}

export async function createServiceMaster(connection: any, payload: any = {}) {
  const id = requiredText(payload.id, 'id');
  const name = requiredText(payload.name, 'name');

  await connection.execute(sql('insertServiceMaster.sql'), {
    id,
    name,
    category:      nullableText(payload.category),
    default_freq:  nullableText(payload.defaultFreq),
    versions_json: serializeJson(payload.versions),
    items_json:    nullableClob(serializeJson(payload.items)),
    enabled:       toFlag(payload.enabled, true) ? 1 : 0,
  });

  return await findServiceMasterById(connection, id);
}

export async function updateServiceMaster(connection: any, masterId: string, payload: any = {}) {
  const id = String(masterId || '').trim();
  if (!id) throw validationError('masterId가 필요합니다');
  const current = await findServiceMasterById(connection, id);
  if (!current) throw notFoundError('서비스 마스터를 찾을 수 없습니다');

  await connection.execute(sql('updateServiceMaster.sql'), {
    id,
    name:          has(payload, 'name')     ? requiredText(payload.name, 'name') : current.name,
    category:      toOptional(payload, 'category', current.category),
    default_freq:  toOptional(payload, 'defaultFreq', current.defaultFreq),
    versions_json: has(payload, 'versions') ? serializeJson(payload.versions) : JSON.stringify(current.versions),
    items_json:    nullableClob(has(payload, 'items') ? serializeJson(payload.items) : JSON.stringify(current.items)),
    enabled:       has(payload, 'enabled')  ? (toFlag(payload.enabled) ? 1 : 0) : current.enabled,
  });

  return await findServiceMasterById(connection, id);
}

export async function deleteServiceMaster(connection: any, masterId: string) {
  const id = String(masterId || '').trim();
  if (!id) throw validationError('masterId가 필요합니다');
  const current = await findServiceMasterById(connection, id);
  if (!current) throw notFoundError('서비스 마스터를 찾을 수 없습니다');

  await connection.execute(sql('deleteServiceMaster.sql'), { id });
  return await findServiceMasterById(connection, id);
}

function normalizeRow(row: any) {
  return {
    ...row,
    versions:  parseJson(row.versionsJson, []),
    items:     parseJson(row.itemsJson, []),
    enabled:   row.enabled === 1,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

function parseJson(raw: any, fallback: any) {
  if (!raw) return fallback;
  try { return JSON.parse(typeof raw === 'string' ? raw : raw.toString()); }
  catch { return fallback; }
}

function serializeJson(value: any) {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  return JSON.stringify(value);
}
