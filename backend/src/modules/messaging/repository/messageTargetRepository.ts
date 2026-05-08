/**
 * 파일: backend/src/modules/messaging/repository/messageTargetRepository.ts
 * 역할: CHANNEL_MESSAGE_TARGETS (메시지 ↔ 서버 N:M) CRUD.
 *       비어있으면 메시지는 "업무 전체 대상".
 *       서버 칩 다중 선택으로 한 메시지가 여러 서버에 연결될 수 있다.
 *
 * 연관 파일:
 *   - schema/workspaceSchema.ts          : DDL
 *   - repository/messageRepository.ts    : 메시지 생성/조회 시 함께 호출
 */

import oracledb from 'oracledb';
import { toInt, validationError } from '../../../infra/oracle/helpers.js';

/**
 * 메시지의 대상 서버 목록을 교체한다.
 * 기존 targets를 모두 제거 후 새 serverIds를 등록.
 * serverIds가 비면 전부 제거 → 그 메시지는 "업무 전체" 대상.
 */
export async function setMessageTargets(
  connection: any,
  messageId: number | string,
  serverIds: ReadonlyArray<number | string> = [],
): Promise<void> {
  const mid = toInt(messageId);
  if (!mid) throw validationError('messageId가 유효하지 않습니다');

  await connection.execute(
    `DELETE FROM CHANNEL_MESSAGE_TARGETS WHERE MESSAGE_ID = :mid`,
    { mid },
  );

  const ids = Array.from(new Set(
    (serverIds || [])
      .map((s) => toInt(s))
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0),
  ));
  for (const sid of ids) {
    await connection.execute(
      `INSERT INTO CHANNEL_MESSAGE_TARGETS (MESSAGE_ID, SERVER_ID) VALUES (:mid, :sid)`,
      { mid, sid },
    );
  }
}

/**
 * 메시지 N개의 targets를 한 번에 조회한다.
 * 반환: Map<messageId, [{ serverId, serverName }, ...]>
 */
export async function fetchTargetsForMessages(
  connection: any,
  messageIds: ReadonlyArray<number | string>,
): Promise<Map<number, Array<{ serverId: number; serverName: string }>>> {
  const ids = Array.from(new Set(
    (messageIds || [])
      .map((m) => toInt(m))
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0),
  ));
  const out = new Map<number, Array<{ serverId: number; serverName: string }>>();
  if (ids.length === 0) return out;

  // Oracle IN 바인딩 한계를 피하려고 작은 청크로 쪼개 조회
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const placeholders = chunk.map((_, idx) => `:m${idx}`).join(', ');
    const binds: Record<string, number> = {};
    chunk.forEach((id, idx) => { binds[`m${idx}`] = id; });

    const result = await connection.execute(
      `SELECT t.MESSAGE_ID  AS "messageId",
              t.SERVER_ID   AS "serverId",
              s.SERVER_NAME AS "serverName"
         FROM CHANNEL_MESSAGE_TARGETS t
         JOIN CHANNEL_SERVERS s ON s.CHANNEL_SERVER_ID = t.SERVER_ID
        WHERE t.MESSAGE_ID IN (${placeholders})`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    for (const row of (result.rows || []) as any[]) {
      const arr = out.get(row.messageId) || [];
      arr.push({ serverId: row.serverId, serverName: row.serverName });
      out.set(row.messageId, arr);
    }
  }
  return out;
}

/**
 * 단일 메시지의 targets를 조회한다.
 */
export async function listMessageTargets(
  connection: any,
  messageId: number | string,
): Promise<Array<{ serverId: number; serverName: string }>> {
  const map = await fetchTargetsForMessages(connection, [messageId]);
  const mid = toInt(messageId);
  return mid ? (map.get(mid) || []) : [];
}
