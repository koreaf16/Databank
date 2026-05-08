/**
 * 파일: backend/src/modules/organization/repository/positionRepository.ts
 * 역할: 직급/직책(POSITIONS) 테이블 CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  requiredText,
  requiredId,
  toFlag,
  notFoundError,
  isUniqueError,
  conflictError,
  loadSql,
} from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

export async function listPositions(connection: any, options: any = {}) {
  const enabledOnly = options.enabledOnly !== false;
  const result = await connection.execute(sql('listPositions.sql'), {
    enabled_only: enabledOnly ? 1 : 0,
  });
  return result.rows || [];
}

export async function createPosition(connection: any, payload: any = {}) {
  const name = requiredText(payload.name, '직급명');
  const sortOrder = Number(payload.sortOrder || 0);
  const enabled = toFlag(payload.enabled, true);

  try {
    await connection.execute(sql('createPosition.sql'), {
      name,
      sort_order: sortOrder,
      enabled,
    });
    // 생성된 결과를 리턴하기 위해 목록에서 조회 (IDENTITY이므로)
    const result = await connection.execute(sql('getPositionByName.sql'), { name });
    return result.rows?.[0];
  } catch (err: any) {
    if (isUniqueError(err)) throw conflictError('이미 존재하는 직급명입니다');
    throw err;
  }
}

export async function updatePosition(connection: any, id: number, payload: any = {}) {
  const posId = requiredId(id);
  const current = await connection.execute(sql('getPositionById.sql'), { id: posId });
  if (!current.rows?.length) throw notFoundError('직급을 찾을 수 없습니다');

  const has = (k: string) => Object.prototype.hasOwnProperty.call(payload, k);
  const nextName = has('name') ? requiredText(payload.name, '직급명') : current.rows[0].POSITION_NAME;
  const nextSort = has('sortOrder') ? Number(payload.sortOrder) : current.rows[0].SORT_ORDER;
  const nextEnabled = has('enabled') ? toFlag(payload.enabled) : current.rows[0].ENABLED;

  try {
    await connection.execute(sql('updatePosition.sql'), {
      id: posId,
      name: nextName,
      sort_order: nextSort,
      enabled: nextEnabled,
    });
    return { id: posId, name: nextName, sortOrder: nextSort, enabled: nextEnabled };
  } catch (err: any) {
    if (isUniqueError(err)) throw conflictError('이미 존재하는 직급명입니다');
    throw err;
  }
}

export async function deletePosition(connection: any, id: number) {
  const posId = requiredId(id);
  await connection.execute(sql('deletePosition.sql'), { id: posId });
  return { id: posId, enabled: 0 };
}
