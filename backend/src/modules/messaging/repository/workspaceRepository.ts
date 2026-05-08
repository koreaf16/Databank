/**
 * 파일: backend/src/modules/messaging/repository/workspaceRepository.ts
 * 역할: 채널 안 업무(CHANNEL_WORKSPACES) CRUD.
 *       업무 = 시스템 단위 작업 공간 (예: 계정계시스템, 홈페이지, MIS).
 *       서버는 이 업무 안에 속하고, 메시지/이력은 업무에 1차로 묶인다.
 *
 * 연관 파일:
 *   - schema/workspaceSchema.ts          : DDL
 *   - routes/messagingRoutes.ts          : 라우트 등록
 *   - repository/channelServerRepository : workspaceId 필터 (후속 단계)
 */

import oracledb from 'oracledb';
import {
  has,
  nullableText,
  requiredId,
  requiredText,
  validationError,
  notFoundError,
} from '../../../infra/oracle/helpers.js';

const VALID_STATUSES = new Set(['active', 'paused', 'archived']);

function normalizeStatus(value: any, fallback = 'active'): string {
  const status = String(value ?? fallback).trim() || fallback;
  if (!VALID_STATUSES.has(status)) {
    throw validationError('상태는 active, paused, archived 중 하나여야 합니다');
  }
  return status;
}

function nullableUserId(value: any): number | null {
  if (value == null || value === '') return null;
  return requiredId(value, '담당자 ID가 유효하지 않습니다');
}

function normalizeRow(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    channelId: row.channelId,
    name: row.name,
    status: row.status,
    primaryOwnerId: row.primaryOwnerId ?? null,
    primaryOwnerName: row.primaryOwnerName ?? null,
    primaryOwnerDeptId: row.primaryOwnerDeptId ?? null,
    secondaryOwnerId: row.secondaryOwnerId ?? null,
    secondaryOwnerName: row.secondaryOwnerName ?? null,
    secondaryOwnerDeptId: row.secondaryOwnerDeptId ?? null,
    memo: row.memo ?? null,
    enabled: row.enabled === 1,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

const SELECT_WORKSPACE_SQL = `
  SELECT
    w.WORKSPACE_ID      AS "id",
    w.CHANNEL_ID        AS "channelId",
    w.NAME              AS "name",
    w.STATUS            AS "status",
    w.PRIMARY_OWNER_ID  AS "primaryOwnerId",
    pu.DISPLAY_NAME     AS "primaryOwnerName",
    pu.DEPT_ID          AS "primaryOwnerDeptId",
    w.SECONDARY_OWNER_ID AS "secondaryOwnerId",
    su.DISPLAY_NAME     AS "secondaryOwnerName",
    su.DEPT_ID          AS "secondaryOwnerDeptId",
    w.MEMO              AS "memo",
    w.ENABLED           AS "enabled",
    w.CREATED_BY        AS "createdBy",
    w.CREATED_AT        AS "createdAt",
    w.UPDATED_AT        AS "updatedAt"
  FROM CHANNEL_WORKSPACES w
  LEFT JOIN USERS pu ON pu.USER_ID = w.PRIMARY_OWNER_ID
  LEFT JOIN USERS su ON su.USER_ID = w.SECONDARY_OWNER_ID
`;

export async function listChannelWorkspaces(connection: any, channelId: number) {
  const cid = requiredId(channelId, '채널 ID가 유효하지 않습니다');
  const result = await connection.execute(
    `${SELECT_WORKSPACE_SQL}
     WHERE w.CHANNEL_ID = :cid AND w.ENABLED = 1
     ORDER BY w.NAME`,
    { cid },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (result.rows || []).map(normalizeRow);
}

export async function findChannelWorkspace(connection: any, channelId: number, workspaceId: number) {
  const cid = requiredId(channelId, '채널 ID가 유효하지 않습니다');
  const wid = requiredId(workspaceId, '업무 ID가 유효하지 않습니다');
  const result = await connection.execute(
    `${SELECT_WORKSPACE_SQL}
     WHERE w.CHANNEL_ID = :cid AND w.WORKSPACE_ID = :wid AND w.ENABLED = 1`,
    { cid, wid },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return normalizeRow(result.rows?.[0] || null);
}

export async function createChannelWorkspace(
  connection: any,
  channelId: number,
  payload: any = {},
  createdBy: number | null = null,
) {
  const cid = requiredId(channelId, '채널 ID가 유효하지 않습니다');
  const name = requiredText(payload.name, '업무명');
  const status = normalizeStatus(payload.status, 'active');
  const primaryOwnerId = nullableUserId(payload.primaryOwnerId);
  const secondaryOwnerId = nullableUserId(payload.secondaryOwnerId);
  if (primaryOwnerId && secondaryOwnerId && primaryOwnerId === secondaryOwnerId) {
    throw validationError('정 엔지니어와 부 엔지니어는 서로 달라야 합니다');
  }
  const memo = nullableText(payload.memo);

  const result = await connection.execute(
    `INSERT INTO CHANNEL_WORKSPACES
       (CHANNEL_ID, NAME, STATUS, PRIMARY_OWNER_ID, SECONDARY_OWNER_ID, MEMO, CREATED_BY, UPDATED_AT)
     VALUES
       (:cid, :name, :status, :primaryOwnerId, :secondaryOwnerId, :memo, :createdBy, SYSTIMESTAMP)
     RETURNING WORKSPACE_ID INTO :workspaceId`,
    {
      cid,
      name,
      status,
      primaryOwnerId,
      secondaryOwnerId,
      memo,
      createdBy,
      workspaceId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
    },
  );
  const workspaceId = result.outBinds?.workspaceId?.[0];
  return findChannelWorkspace(connection, cid, workspaceId);
}

export async function updateChannelWorkspace(
  connection: any,
  channelId: number,
  workspaceId: number,
  payload: any = {},
) {
  const cid = requiredId(channelId, '채널 ID가 유효하지 않습니다');
  const wid = requiredId(workspaceId, '업무 ID가 유효하지 않습니다');
  const current = await findChannelWorkspace(connection, cid, wid);
  if (!current) throw notFoundError('업무를 찾을 수 없습니다');

  await connection.execute(
    `UPDATE CHANNEL_WORKSPACES
        SET NAME = :name,
            STATUS = :status,
            PRIMARY_OWNER_ID = :primaryOwnerId,
            MEMO = :memo,
            UPDATED_AT = SYSTIMESTAMP
      WHERE WORKSPACE_ID = :wid AND CHANNEL_ID = :cid AND ENABLED = 1`,
    {
      wid,
      cid,
      name: has(payload, 'name') ? requiredText(payload.name, '업무명') : current.name,
      status: has(payload, 'status') ? normalizeStatus(payload.status, current.status) : current.status,
      primaryOwnerId: has(payload, 'primaryOwnerId') ? nullableUserId(payload.primaryOwnerId) : current.primaryOwnerId,
      memo: has(payload, 'memo') ? nullableText(payload.memo) : current.memo,
    },
  );
  return findChannelWorkspace(connection, cid, wid);
}

export async function deleteChannelWorkspace(connection: any, channelId: number, workspaceId: number) {
  const cid = requiredId(channelId, '채널 ID가 유효하지 않습니다');
  const wid = requiredId(workspaceId, '업무 ID가 유효하지 않습니다');
  const current = await findChannelWorkspace(connection, cid, wid);
  if (!current) throw notFoundError('업무를 찾을 수 없습니다');
  await connection.execute(
    `UPDATE CHANNEL_WORKSPACES
        SET ENABLED = 0, UPDATED_AT = SYSTIMESTAMP
      WHERE WORKSPACE_ID = :wid AND CHANNEL_ID = :cid`,
    { wid, cid },
  );
  return { workspaceId: wid, removed: true };
}
