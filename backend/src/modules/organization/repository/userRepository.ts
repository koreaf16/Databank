/**
 * 파일: backend/src/modules/organization/repository/userRepository.ts
 * 역할: 사용자(USERS) 테이블 CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  requiredText,
  requiredId,
  toNullableInt,
  toFlag,
  toNullableFlag,
  nullableText,
  toOptional,
  toOptionalFlag,
  notFoundError,
  conflictError,
  isUniqueError,
  loadSql,
} from '../../../infra/oracle/helpers.js';
import { findDepartmentById } from './departmentRepository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

export async function listUsers(connection: any, options: any = {}) {
  const enabledOnly = options.enabledOnly !== false;
  const deptId = options.deptId ?? null;

  const result = await connection.execute(sql('listUsers.sql'), {
    enabled_only: enabledOnly ? 1 : 0,
    dept_id: deptId,
  });
  return result.rows || [];
}

export async function createUser(connection: any, payload: any = {}) {
  const username = requiredText(payload.username, '사용자명').toLowerCase();
  const name = requiredText(payload.name, '표시 이름');
  const deptId = requiredId(payload.deptId, '부서 ID가 필요합니다');
  const department = await findDepartmentById(connection, deptId);
  if (!department) throw notFoundError('부서를 찾을 수 없습니다');

  const nextId = await nextUserId(connection);
  try {
    await connection.execute(sql('createUser.sql'), {
      id: nextId,
      username,
      name,
      password_hash: nullableText(payload.passwordHash),
      enabled: toFlag(payload.enabled, true) ? 1 : 0,
      dept_id: deptId,
      email: nullableText(payload.email),
      position_name: nullableText(payload.position),
      position_id: toNullableInt(payload.positionId),
      admin_type: nullableText(payload.adminType),
      use_type: nullableText(payload.useType),
      rbac_role_id: nullableText(payload.rbacRoleId),
      telegram_id: nullableText(payload.telegramId),
      check_notice: toNullableFlag(payload.checkNotice),
      check_update: toNullableFlag(payload.checkUpdate),
    });
  } catch (error) {
    if (isUniqueError(error)) throw conflictError('이미 사용 중인 사용자명입니다');
    throw error;
  }
  return findUserById(connection, nextId);
}

export async function updateUser(connection: any, userId: number, payload: any = {}) {
  const id = requiredId(userId, '사용자 ID가 유효하지 않습니다');
  const current = await findUserById(connection, id);
  if (!current) throw notFoundError('사용자를 찾을 수 없습니다');

  const hasF = (k: string) => Object.prototype.hasOwnProperty.call(payload, k);
  const nextUsername = hasF('username') ? requiredText(payload.username, '사용자명').toLowerCase() : current.username;
  const nextName = hasF('name') ? requiredText(payload.name, '표시 이름') : current.name;
  const nextDeptId = hasF('deptId') ? requiredId(payload.deptId, '부서 ID가 필요합니다') : current.deptId;
  const nextEnabled = hasF('enabled') ? toFlag(payload.enabled) : current.enabled;

  const department = await findDepartmentById(connection, nextDeptId);
  if (!department) throw notFoundError('부서를 찾을 수 없습니다');

  try {
    await connection.execute(sql('updateUser.sql'), {
      id,
      username: nextUsername,
      name: nextName,
      dept_id: nextDeptId,
      enabled: nextEnabled ? 1 : 0,
      email: toOptional(payload, 'email', current.email),
      position_name: toOptional(payload, 'position', current.position),
      position_id: hasF('positionId') ? toNullableInt(payload.positionId) : toNullableInt(current.positionId),
      admin_type: toOptional(payload, 'adminType', current.adminType),
      use_type: toOptional(payload, 'useType', current.useType),
      rbac_role_id: hasF('rbacRoleId') ? nullableText(payload.rbacRoleId) : nullableText(current.rbacRoleId),
      telegram_id: toOptional(payload, 'telegramId', current.telegramId),
      check_notice: toOptionalFlag(payload, 'checkNotice', current.checkNotice),
      check_update: toOptionalFlag(payload, 'checkUpdate', current.checkUpdate),
    });
  } catch (error) {
    if (isUniqueError(error)) throw conflictError('이미 사용 중인 사용자명입니다');
    throw error;
  }
  return findUserById(connection, id);
}

export async function deleteUser(connection: any, userId: number) {
  const id = requiredId(userId, '사용자 ID가 유효하지 않습니다');
  const current = await findUserById(connection, id);
  if (!current) throw notFoundError('사용자를 찾을 수 없습니다');

  await connection.execute(sql('deleteUser.sql'), { id });
  return findUserById(connection, id);
}

export async function findUserById(connection: any, userId: number) {
  const result = await connection.execute(sql('findUserById.sql'), { id: userId });
  return result.rows?.[0] || null;
}

async function nextUserId(connection: any) {
  const result = await connection.execute(sql('nextUserId.sql'));
  return result.rows?.[0]?.id || 1;
}
