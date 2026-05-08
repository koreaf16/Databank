/**
 * 파일: backend/src/modules/support-history/repository/historyTargetRepository.ts
 * 역할: SUPPORT_HISTORY_TARGETS (이력 ↔ 서버 N:M) CRUD.
 *       비어있으면 이력은 "업무 전체" 이력.
 *       1건 이력에 여러 서버 묶음 연결 가능.
 *
 * 연관 파일:
 *   - schema/workspaceSchema.ts (messaging 모듈)        : DDL
 *   - repository/supportHistoryRepository.ts             : 이력 생성/조회 시 함께 호출
 */

import oracledb from 'oracledb';
import { toInt, validationError } from '../../../infra/oracle/helpers.js';

export async function setHistoryTargets(
  connection: any,
  historyId: string,
  serverIds: ReadonlyArray<number | string> = [],
): Promise<void> {
  const hid = String(historyId || '').trim();
  if (!hid) throw validationError('historyId가 유효하지 않습니다');

  await connection.execute(
    `DELETE FROM SUPPORT_HISTORY_TARGETS WHERE HISTORY_ID = :hid`,
    { hid },
  );

  const ids = Array.from(new Set(
    (serverIds || [])
      .map((s) => toInt(s))
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0),
  ));
  for (const sid of ids) {
    await connection.execute(
      `INSERT INTO SUPPORT_HISTORY_TARGETS (HISTORY_ID, SERVER_ID) VALUES (:hid, :sid)`,
      { hid, sid },
    );
  }
}

export async function fetchTargetsForHistories(
  connection: any,
  historyIds: ReadonlyArray<string>,
): Promise<Map<string, Array<{ serverId: number; serverName: string }>>> {
  const ids = Array.from(new Set(
    (historyIds || []).map((h) => String(h).trim()).filter(Boolean),
  ));
  const out = new Map<string, Array<{ serverId: number; serverName: string }>>();
  if (ids.length === 0) return out;

  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const placeholders = chunk.map((_, idx) => `:h${idx}`).join(', ');
    const binds: Record<string, string> = {};
    chunk.forEach((id, idx) => { binds[`h${idx}`] = id; });

    const result = await connection.execute(
      `SELECT t.HISTORY_ID  AS "historyId",
              t.SERVER_ID   AS "serverId",
              s.SERVER_NAME AS "serverName"
         FROM SUPPORT_HISTORY_TARGETS t
         JOIN CHANNEL_SERVERS s ON s.CHANNEL_SERVER_ID = t.SERVER_ID
        WHERE t.HISTORY_ID IN (${placeholders})`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    for (const row of (result.rows || []) as any[]) {
      const arr = out.get(row.historyId) || [];
      arr.push({ serverId: row.serverId, serverName: row.serverName });
      out.set(row.historyId, arr);
    }
  }
  return out;
}

export async function listHistoryTargets(
  connection: any,
  historyId: string,
): Promise<Array<{ serverId: number; serverName: string }>> {
  const map = await fetchTargetsForHistories(connection, [historyId]);
  return map.get(String(historyId)) || [];
}
