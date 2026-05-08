/**
 * 파일: backend/src/modules/messaging/repository/channelServerRepository.ts
 * 역할: 고객사 채널 안의 서버(업무) 목록과 정/부 엔지니어 배정을 관리한다.
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

const VALID_STATUSES = new Set(['active', 'warning', 'incident', 'paused']);

function normalizeStatus(value: any, fallback = 'active'): string {
  const status = String(value ?? fallback).trim() || fallback;
  if (!VALID_STATUSES.has(status)) {
    throw validationError('상태는 active, warning, incident, paused 중 하나여야 합니다');
  }
  return status;
}

function nullableUserId(value: any): number | null {
  if (value == null || value === '') return null;
  return requiredId(value, '엔지니어 ID가 유효하지 않습니다');
}

function assertEngineerPair(primaryId: number | null, secondaryId: number | null) {
  if (primaryId != null && secondaryId != null && primaryId === secondaryId) {
    throw validationError('정 엔지니어와 부 엔지니어는 서로 달라야 합니다');
  }
}

function normalizeRow(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    channelId: row.channelId,
    channelName: row.channelName ?? null,
    customerId: row.customerId ?? null,
    customerName: row.customerName ?? null,
    serverName: row.serverName,
    platform: row.platform ?? null,
    productName: row.productName,
    status: row.status,
    primaryEngineerId: row.primaryEngineerId ?? null,
    primaryEngineerName: row.primaryEngineerName ?? null,
    primaryEngineerPosition: row.primaryEngineerPosition ?? null,
    secondaryEngineerId: row.secondaryEngineerId ?? null,
    secondaryEngineerName: row.secondaryEngineerName ?? null,
    secondaryEngineerPosition: row.secondaryEngineerPosition ?? null,
    workspaceId: row.workspaceId ?? null,
    memo: row.memo ?? null,
    enabled: row.enabled === 1,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    myRole: row.myRole ?? null,
  };
}

const SELECT_SERVER_SQL = `
  SELECT
    s.CHANNEL_SERVER_ID AS "id",
    s.CHANNEL_ID AS "channelId",
    c.NAME AS "channelName",
    c.CUSTOMER_ID AS "customerId",
    cu.CUSTOMER_MAIN AS "customerName",
    s.SERVER_NAME AS "serverName",
    s.PLATFORM AS "platform",
    s.PRODUCT_NAME AS "productName",
    s.STATUS AS "status",
    s.PRIMARY_ENGINEER_ID AS "primaryEngineerId",
    pu.DISPLAY_NAME AS "primaryEngineerName",
    pp.POSITION_NAME AS "primaryEngineerPosition",
    s.SECONDARY_ENGINEER_ID AS "secondaryEngineerId",
    su.DISPLAY_NAME AS "secondaryEngineerName",
    sp.POSITION_NAME AS "secondaryEngineerPosition",
    s.WORKSPACE_ID AS "workspaceId",
    s.MEMO AS "memo",
    s.ENABLED AS "enabled",
    s.CREATED_BY AS "createdBy",
    s.CREATED_AT AS "createdAt",
    s.UPDATED_AT AS "updatedAt"
  FROM CHANNEL_SERVERS s
  JOIN CHANNELS c ON c.CHANNEL_ID = s.CHANNEL_ID
  LEFT JOIN CUSTOMERS cu ON cu.CUSTOMER_ID = c.CUSTOMER_ID
  LEFT JOIN USERS pu ON pu.USER_ID = s.PRIMARY_ENGINEER_ID
  LEFT JOIN POSITIONS pp ON pp.POSITION_ID = pu.POSITION_ID
  LEFT JOIN USERS su ON su.USER_ID = s.SECONDARY_ENGINEER_ID
  LEFT JOIN POSITIONS sp ON sp.POSITION_ID = su.POSITION_ID
`;

export async function listChannelServers(connection: any, channelId: number) {
  const cid = requiredId(channelId, '채널 ID가 유효하지 않습니다');
  const result = await connection.execute(
    `${SELECT_SERVER_SQL}
     WHERE s.CHANNEL_ID = :cid AND s.ENABLED = 1
     ORDER BY s.SERVER_NAME`,
    { cid },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (result.rows || []).map(normalizeRow);
}

export async function findChannelServer(connection: any, channelId: number, serverId: number) {
  const cid = requiredId(channelId, '채널 ID가 유효하지 않습니다');
  const sid = requiredId(serverId, '서버 ID가 유효하지 않습니다');
  const result = await connection.execute(
    `${SELECT_SERVER_SQL}
     WHERE s.CHANNEL_ID = :cid AND s.CHANNEL_SERVER_ID = :sid AND s.ENABLED = 1`,
    { cid, sid },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return normalizeRow(result.rows?.[0] || null);
}

export async function createChannelServer(connection: any, channelId: number, payload: any = {}, createdBy: number | null = null) {
  const cid = requiredId(channelId, '채널 ID가 유효하지 않습니다');
  const serverName = requiredText(payload.serverName, '서버명');
  const productName = requiredText(payload.productName, '제품명');
  const platform = nullableText(payload.platform);
  const status = normalizeStatus(payload.status, 'active');
  const primaryEngineerId = nullableUserId(payload.primaryEngineerId);
  const secondaryEngineerId = nullableUserId(payload.secondaryEngineerId);
  assertEngineerPair(primaryEngineerId, secondaryEngineerId);

  const workspaceId = payload.workspaceId != null && payload.workspaceId !== ''
    ? Number(payload.workspaceId) || null
    : null;

  const result = await connection.execute(
    `INSERT INTO CHANNEL_SERVERS
       (CHANNEL_ID, SERVER_NAME, PLATFORM, PRODUCT_NAME, STATUS,
        PRIMARY_ENGINEER_ID, SECONDARY_ENGINEER_ID, WORKSPACE_ID, MEMO, CREATED_BY, UPDATED_AT)
     VALUES
       (:cid, :serverName, :platform, :productName, :status,
        :primaryEngineerId, :secondaryEngineerId, :workspaceId, :memo, :createdBy, SYSTIMESTAMP)
     RETURNING CHANNEL_SERVER_ID INTO :serverId`,
    {
      cid,
      serverName,
      platform,
      productName,
      status,
      primaryEngineerId,
      secondaryEngineerId,
      workspaceId,
      memo: nullableText(payload.memo),
      createdBy,
      serverId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
    },
  );
  const serverId = result.outBinds?.serverId?.[0];
  return findChannelServer(connection, cid, serverId);
}

export async function updateChannelServer(connection: any, channelId: number, serverId: number, payload: any = {}) {
  const cid = requiredId(channelId, '채널 ID가 유효하지 않습니다');
  const sid = requiredId(serverId, '서버 ID가 유효하지 않습니다');
  const current = await findChannelServer(connection, cid, sid);
  if (!current) throw notFoundError('서버를 찾을 수 없습니다');

  const nextPrimaryId = has(payload, 'primaryEngineerId')
    ? nullableUserId(payload.primaryEngineerId)
    : current.primaryEngineerId;
  const nextSecondaryId = has(payload, 'secondaryEngineerId')
    ? nullableUserId(payload.secondaryEngineerId)
    : current.secondaryEngineerId;
  assertEngineerPair(nextPrimaryId, nextSecondaryId);

  const nextWorkspaceId = has(payload, 'workspaceId')
    ? (payload.workspaceId != null && payload.workspaceId !== '' ? Number(payload.workspaceId) || null : null)
    : current.workspaceId;

  await connection.execute(
    `UPDATE CHANNEL_SERVERS
        SET SERVER_NAME = :serverName,
            PLATFORM = :platform,
            PRODUCT_NAME = :productName,
            STATUS = :status,
            PRIMARY_ENGINEER_ID = :primaryEngineerId,
            SECONDARY_ENGINEER_ID = :secondaryEngineerId,
            WORKSPACE_ID = :workspaceId,
            MEMO = :memo,
            UPDATED_AT = SYSTIMESTAMP
      WHERE CHANNEL_SERVER_ID = :sid
        AND CHANNEL_ID = :cid
        AND ENABLED = 1`,
    {
      sid,
      cid,
      serverName: has(payload, 'serverName') ? requiredText(payload.serverName, '서버명') : current.serverName,
      platform: has(payload, 'platform') ? nullableText(payload.platform) : current.platform,
      productName: has(payload, 'productName') ? requiredText(payload.productName, '제품명') : current.productName,
      status: has(payload, 'status') ? normalizeStatus(payload.status, current.status) : current.status,
      primaryEngineerId: nextPrimaryId,
      secondaryEngineerId: nextSecondaryId,
      workspaceId: nextWorkspaceId,
      memo: has(payload, 'memo') ? nullableText(payload.memo) : current.memo,
    },
  );
  return findChannelServer(connection, cid, sid);
}

export async function deleteChannelServer(connection: any, channelId: number, serverId: number) {
  const cid = requiredId(channelId, '채널 ID가 유효하지 않습니다');
  const sid = requiredId(serverId, '서버 ID가 유효하지 않습니다');
  const current = await findChannelServer(connection, cid, sid);
  if (!current) throw notFoundError('서버를 찾을 수 없습니다');
  await connection.execute(
    `UPDATE CHANNEL_SERVERS
        SET ENABLED = 0, UPDATED_AT = SYSTIMESTAMP
      WHERE CHANNEL_SERVER_ID = :sid AND CHANNEL_ID = :cid`,
    { sid, cid },
  );
  return { serverId: sid, removed: true };
}

export async function listAssignedServers(connection: any, userId: number) {
  const meId = requiredId(userId, '사용자 ID가 유효하지 않습니다');
  const result = await connection.execute(
    `SELECT base.*,
            CASE
              WHEN base."primaryEngineerId" = :meId THEN 'primary'
              WHEN base."secondaryEngineerId" = :meId THEN 'secondary'
            END AS "myRole"
       FROM (${SELECT_SERVER_SQL}
             WHERE s.ENABLED = 1
               AND (s.PRIMARY_ENGINEER_ID = :meId OR s.SECONDARY_ENGINEER_ID = :meId)
            ) base
       ORDER BY base."customerName", base."channelName", base."serverName"`,
    { meId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (result.rows || []).map(normalizeRow);
}
