/**
 * 파일: backend/src/modules/settings/rbac/repository/rbacRepository.ts
 * 역할: RBAC 4개 테이블 조회·수정.
 *       listRoles, listPermissionGroups, getMatrix, updateMatrixEntry.
 *
 * 연관 파일:
 *   - schema/rbacSchema.ts   : DDL
 *   - routes/rbacRoutes.ts   : HTTP 라우트
 *   - infra/oracle/helpers.ts : validationError 등
 */

import oracledb from 'oracledb';
import { validationError } from '../../../../infra/oracle/helpers.js';

const VALID_VALUES = new Set(['true', 'false', 'self']);

export async function listRoles(connection) {
  const result = await connection.execute(
    `SELECT ROLE_ID AS "id", LABEL AS "label", COLOR AS "color",
            DESCRIPTION AS "desc", SORT_ORDER AS "order", ENABLED AS "enabled"
     FROM RBAC_ROLES WHERE ENABLED = 1 ORDER BY SORT_ORDER`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (result.rows || []).map(r => ({
    id:      r.id,
    label:   r.label,
    color:   r.color ?? null,
    desc:    r.desc  ?? '',
    enabled: r.enabled === 1,
  }));
}

export async function listPermissionGroups(connection) {
  const groupsRes = await connection.execute(
    `SELECT GROUP_ID AS "id", LABEL AS "label", SORT_ORDER AS "order"
     FROM RBAC_PERMISSION_GROUPS ORDER BY SORT_ORDER`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  const permsRes = await connection.execute(
    `SELECT PERM_ID AS "id", GROUP_ID AS "groupId", LABEL AS "label", SORT_ORDER AS "order"
     FROM RBAC_PERMISSIONS ORDER BY GROUP_ID, SORT_ORDER`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  const permsByGroup: Record<string, any[]> = {};
  for (const p of (permsRes.rows || [])) {
    if (!permsByGroup[p.groupId]) permsByGroup[p.groupId] = [];
    permsByGroup[p.groupId].push({ id: p.id, label: p.label });
  }

  return (groupsRes.rows || []).map(g => ({
    id:    g.id,
    label: g.label,
    perms: permsByGroup[g.id] || [],
  }));
}

export async function getMatrix(connection) {
  const result = await connection.execute(
    `SELECT ROLE_ID AS "roleId", PERM_ID AS "permId", PERM_VALUE AS "value"
     FROM RBAC_ROLE_PERMISSIONS`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  const matrix: Record<string, Record<string, string | boolean>> = {};
  for (const row of (result.rows || [])) {
    if (!matrix[row.roleId]) matrix[row.roleId] = {};
    matrix[row.roleId][row.permId] = deserializeValue(row.value);
  }
  return matrix;
}

export async function updateMatrixEntry(connection, roleId: string, permId: string, value: string) {
  if (!VALID_VALUES.has(value)) {
    throw validationError('값은 true·false·self 중 하나여야 합니다');
  }

  // MERGE로 없으면 INSERT, 있으면 UPDATE
  await connection.execute(
    `MERGE INTO RBAC_ROLE_PERMISSIONS dest
     USING (SELECT :roleId AS role_id, :permId AS perm_id FROM DUAL) src
     ON (dest.ROLE_ID = src.role_id AND dest.PERM_ID = src.perm_id)
     WHEN MATCHED     THEN UPDATE SET dest.PERM_VALUE = :value
     WHEN NOT MATCHED THEN INSERT (ROLE_ID, PERM_ID, PERM_VALUE) VALUES (src.role_id, src.perm_id, :value)`,
    { roleId, permId, value },
  );

  return { roleId, permId, value: deserializeValue(value) };
}

function deserializeValue(v: string): string | boolean {
  if (v === 'true')  return true;
  if (v === 'false') return false;
  return v; // 'self'
}
