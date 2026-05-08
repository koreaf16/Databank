// @ts-nocheck
import { errorResponse } from './apiResponse.js';
import { getCurrentUserId } from './currentUser.js';
import { withOracleConnection } from '../infra/oracle/withConnection.js';

function isAllowed(value: any, allowSelf = false): boolean {
  return value === true || value === 'true' || (allowSelf && value === 'self');
}

export async function getPermissionValues(connection: any, userId: number, permissionIds: string[]) {
  const ids = [...new Set(permissionIds.filter(Boolean))];
  if (!Number.isFinite(Number(userId)) || ids.length === 0) return {};

  const binds: Record<string, any> = { user_id: Number(userId) };
  const placeholders = ids.map((id, index) => {
    const key = `perm_${index}`;
    binds[key] = id;
    return `:${key}`;
  });

  const result = await connection.execute(
    `SELECT rp.PERM_ID AS "permId", rp.PERM_VALUE AS "value"
       FROM USERS u
       LEFT JOIN RBAC_ROLE_PERMISSIONS rp
         ON rp.ROLE_ID = u.RBAC_ROLE_ID
        AND rp.PERM_ID IN (${placeholders.join(', ')})
      WHERE u.USER_ID = :user_id
        AND u.ENABLED = 1`,
    binds,
  );

  const values: Record<string, any> = {};
  for (const row of result.rows || []) {
    if (row.permId) values[row.permId] = row.value;
  }
  return values;
}

export async function hasPermission(req: any, permissionId: string, options: { allowSelf?: boolean } = {}) {
  const userId = getCurrentUserId(req);
  if (!userId) return false;

  const values = await withOracleConnection((connection: any) =>
    getPermissionValues(connection, userId, [permissionId]),
  );
  return isAllowed(values[permissionId], Boolean(options.allowSelf));
}

export async function requirePermission(req: any, res: any, permissionId: string, options: { allowSelf?: boolean } = {}) {
  const userId = getCurrentUserId(req);
  if (!userId) {
    errorResponse(res, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' }, 401);
    return false;
  }

  const values = await withOracleConnection((connection: any) =>
    getPermissionValues(connection, userId, [permissionId]),
  );
  if (!isAllowed(values[permissionId], Boolean(options.allowSelf))) {
    errorResponse(res, { code: 'FORBIDDEN', message: '권한이 없습니다' }, 403);
    return false;
  }
  return true;
}

export async function requireAnyPermission(req: any, res: any, permissionIds: string[], options: { allowSelf?: boolean } = {}) {
  const userId = getCurrentUserId(req);
  if (!userId) {
    errorResponse(res, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' }, 401);
    return false;
  }

  const values = await withOracleConnection((connection: any) =>
    getPermissionValues(connection, userId, permissionIds),
  );
  const allowed = permissionIds.some((id) => isAllowed(values[id], Boolean(options.allowSelf)));
  if (!allowed) {
    errorResponse(res, { code: 'FORBIDDEN', message: '권한이 없습니다' }, 403);
    return false;
  }
  return true;
}
