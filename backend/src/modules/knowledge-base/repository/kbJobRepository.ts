/**
 * 파일: backend/src/modules/knowledge-base/repository/kbJobRepository.ts
 * 역할: KB_INDEX_JOBS 테이블 큐 관리.
 *       enqueue(잡 추가), dequeue(락 + 하나 꺼내기), progress 갱신, done/fail 처리.
 *
 * 연관 파일:
 *   - schema/kbChunkSchema.ts              : KB_INDEX_JOBS DDL
 *   - services/jobs/jobWorker.ts           : dequeue 호출
 *   - routes/kbStreamRoutes.ts             : getJobProgress 호출
 *
 * 비고: SELECT FOR UPDATE SKIP LOCKED으로 동시 워커 간 충돌 없이 꺼낸다.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { clobFetchHandler, loadSql } from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

export type JobKind = 'parse' | 'chunk' | 'embed' | 'reindex' | 'crawl' | 'download_url';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface JobRecord {
  id: string;
  docId: string | null;
  kind: JobKind;
  payloadJson: string | null;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  errorMsg: string | null;
  progress: number;
  stage: string | null;
  enqueuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

function generateJobId(): string {
  return `kb-job-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function normalizeJob(row: any): JobRecord {
  return {
    id:           row['id'],
    docId:        row['docId'] ?? null,
    kind:         row['kind'] as JobKind,
    payloadJson:  row['payloadJson'] ?? null,
    status:       row['status'] as JobStatus,
    attempts:     Number(row['attempts'] ?? 0),
    maxAttempts:  Number(row['maxAttempts'] ?? 3),
    errorMsg:     row['errorMsg'] ?? null,
    progress:     Number(row['progress'] ?? 0),
    stage:        row['stage'] ?? null,
    enqueuedAt:   row['enqueuedAt'],
    startedAt:    row['startedAt'] ?? null,
    finishedAt:   row['finishedAt'] ?? null,
  };
}

/** 잡 큐에 추가 */
export async function enqueueJob(
  connection: any,
  kind: JobKind,
  docId: string | null,
  payload: Record<string, unknown> = {},
): Promise<string> {
  const jobId = generateJobId();
  await connection.execute(sql('insertJob.sql'), {
    jid:     jobId,
    did:     docId,
    kind,
    payload: JSON.stringify(payload),
  }, { autoCommit: false });
  return jobId;
}

/**
 * 큐에서 잡 하나를 꺼낸다. SKIP LOCKED으로 병렬 워커 간 충돌 없음.
 * status를 'running'으로 바꾸고 STARTED_AT 기록.
 */
export async function dequeueJob(connection: any): Promise<JobRecord | null> {
  const oracledb = (await import('oracledb')).default;
  const fetchSql = `
    ${sql('selectJob.sql')}
    WHERE STATUS = 'queued'
      AND ATTEMPTS < MAX_ATTEMPTS
      AND ROWNUM = 1
    FOR UPDATE SKIP LOCKED
  `;
  const result = await connection.execute(fetchSql, {}, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });
  const row = result.rows?.[0];
  if (!row) return null;

  await connection.execute(sql('dequeueJobUpdate.sql'), { jid: row['id'] }, { autoCommit: false });
  return normalizeJob({ ...row, status: 'running' });
}

/** 진행률 갱신 */
export async function updateProgress(
  connection: any,
  jobId: string,
  progress: number,
  stage: string,
): Promise<void> {
  await connection.execute(sql('updateJobProgress.sql'), {
    prog: Math.min(100, Math.max(0, progress)),
    stage,
    jid: jobId,
  }, { autoCommit: true });
}

/** 완료 처리 */
export async function markDone(connection: any, jobId: string): Promise<void> {
  await connection.execute(sql('markJobDone.sql'), { jid: jobId }, { autoCommit: false });
}

/** 실패 처리. maxAttempts 초과 시 재시도 없음. */
export async function markFailed(
  connection: any,
  jobId: string,
  errorMsg: string,
): Promise<void> {
  await connection.execute(sql('markJobFailed.sql'), {
    err: errorMsg.slice(0, 2000),
    jid: jobId,
  }, { autoCommit: false });
}

/** jobId 목록의 진행상황 조회 (SSE용) */
export async function getJobProgress(
  connection: any,
  jobIds: string[],
): Promise<JobRecord[]> {
  if (jobIds.length === 0) return [];
  const oracledb = (await import('oracledb')).default;
  const placeholders = jobIds.map((_, i) => `:j${i}`).join(',');
  const binds: Record<string, string> = {};
  jobIds.forEach((id, i) => { binds[`j${i}`] = id; });
  const fullSql = `${sql('selectJob.sql')} WHERE JOB_ID IN (${placeholders})`;
  const result = await connection.execute(fullSql, binds, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });
  return (result.rows ?? []).map(normalizeJob);
}

export interface JobRecordWithTitle extends JobRecord {
  docTitle: string | null;
}

/** 최근 잡 목록 조회 (문서 제목 JOIN 포함) */
export async function listRecentJobs(
  connection: any,
  limit = 200,
): Promise<JobRecordWithTitle[]> {
  const oracledb = (await import('oracledb')).default;
  const result = await connection.execute(sql('listRecentJobs.sql'), { lim: limit }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });
  return (result.rows ?? []).map((row: any) => ({
    ...normalizeJob(row),
    docTitle: row['docTitle'] ?? null,
  }));
}

/** 잡 취소 (queued/running → cancelled). 실제 영향 행 수 반환. */
export async function cancelJob(connection: any, jobId: string): Promise<number> {
  const result = await connection.execute(
    sql('cancelJob.sql'),
    { jid: jobId },
    { autoCommit: true },
  );
  return result.rowsAffected ?? 0;
}

/** 잡 단건 삭제 (done/failed/cancelled만 허용). 실제 영향 행 수 반환. */
export async function deleteJob(connection: any, jobId: string): Promise<number> {
  const result = await connection.execute(
    sql('deleteJob.sql'),
    { jid: jobId },
    { autoCommit: true },
  );
  return result.rowsAffected ?? 0;
}

/** 완료된 모든 잡 삭제 (done, failed, cancelled). 실제 영향 행 수 반환. */
export async function deleteCompletedJobs(connection: any): Promise<number> {
  const result = await connection.execute(
    sql('deleteCompletedJobs.sql'),
    {},
    { autoCommit: true },
  );
  return result.rowsAffected ?? 0;
}

/** DOC_ID에 연결된 모든 잡 조회 */
export async function listJobsByDoc(
  connection: any,
  docId: string,
): Promise<JobRecord[]> {
  const oracledb = (await import('oracledb')).default;
  const fullSql = `${sql('selectJob.sql')} WHERE DOC_ID = :did ORDER BY ENQUEUED_AT DESC`;
  const result = await connection.execute(fullSql, { did: docId }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });
  return (result.rows ?? []).map(normalizeJob);
}
