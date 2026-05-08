/**
 * 파일: backend/src/modules/organization/repository/departmentRepository.ts
 * 역할: 부서(DEPARTMENTS) 테이블 CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import oracledb from 'oracledb';
import {
  requiredText,
  requiredId,
  toInt,
  toNullableInt,
  toFlag,
  validationError,
  notFoundError,
  conflictError,
  isUniqueError,
  loadSql,
} from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

export async function listDepartments(connection: any, options: any = {}) {
  const enabledOnly = options.enabledOnly !== false;
  const result = await connection.execute(sql('listDepartments.sql'), {
    enabled_only: enabledOnly ? 1 : 0,
  });
  return result.rows || [];
}

export async function createDepartment(connection: any, payload: any = {}) {
  const name = requiredText(payload.name, '부서명');
  const parentId = toNullableInt(payload.parentId);
  const sortOrder = toInt(payload.sortOrder) ?? 0;

  if (parentId != null) {
    const parent = await findDepartmentById(connection, parentId);
    if (!parent) throw notFoundError('상위 부서를 찾을 수 없습니다');
  }

  try {
    const result = await connection.execute(sql('createDepartment.sql'), {
      name,
      parent_id: parentId,
      sort_order: sortOrder,
      out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    });
    return findDepartmentById(connection, result.outBinds.out_id[0]);
  } catch (error) {
    if (isUniqueError(error)) throw conflictError('이미 존재하는 부서명입니다');
    throw error;
  }
}

export async function updateDepartment(connection: any, deptId: number, payload: any = {}) {
  const id = requiredId(deptId, '부서 ID가 유효하지 않습니다');
  const current = await findDepartmentById(connection, id);
  if (!current) throw notFoundError('부서를 찾을 수 없습니다');

  const hasF = (k: string) => Object.prototype.hasOwnProperty.call(payload, k);
  if (!hasF('name') && !hasF('parentId') && !hasF('sortOrder') && !hasF('enabled')) return current;

  const nextName = hasF('name') ? requiredText(payload.name, '부서명') : current.name;
  const nextParentId = hasF('parentId') ? toNullableInt(payload.parentId) : current.parentId;
  const nextSortOrder = hasF('sortOrder') ? (toInt(payload.sortOrder) ?? 0) : current.sortOrder;
  const nextEnabled = hasF('enabled') ? toFlag(payload.enabled) : current.enabled;

  if (nextParentId === id) throw validationError('자기 자신을 상위 부서로 설정할 수 없습니다');
  if (nextParentId != null) {
    const parent = await findDepartmentById(connection, nextParentId);
    if (!parent) throw notFoundError('상위 부서를 찾을 수 없습니다');
  }

  try {
    await connection.execute(sql('updateDepartment.sql'), {
      id,
      name: nextName,
      parent_id: nextParentId,
      sort_order: nextSortOrder,
      enabled: nextEnabled ? 1 : 0,
    });
  } catch (error) {
    if (isUniqueError(error)) throw conflictError('이미 존재하는 부서명입니다');
    throw error;
  }
  return findDepartmentById(connection, id);
}

export async function deleteDepartment(connection: any, deptId: number) {
  const id = requiredId(deptId, '부서 ID가 유효하지 않습니다');
  const current = await findDepartmentById(connection, id);
  if (!current) throw notFoundError('부서를 찾을 수 없습니다');
  if (current.parentId == null) throw conflictError('최상위 부서는 비활성화할 수 없습니다');

  const childCount = await scalarCount(connection, sql('countChildDepartments.sql'), { id });
  if (childCount > 0) throw conflictError('활성 하위 부서가 있어 비활성화할 수 없습니다');

  const userCount = await scalarCount(connection, sql('countDepartmentUsers.sql'), { id });
  if (userCount > 0) throw conflictError('소속 활성 사용자가 있어 비활성화할 수 없습니다');

  await connection.execute(sql('deleteDepartment.sql'), { id });
  return findDepartmentById(connection, id);
}

export async function findDepartmentById(connection: any, deptId: number) {
  const result = await connection.execute(sql('findDepartmentById.sql'), { id: deptId });
  return result.rows?.[0] || null;
}

async function scalarCount(connection: any, sqlQuery: string, binds: any) {
  const result = await connection.execute(sqlQuery, binds);
  return Number(result.rows?.[0]?.count || 0);
}
