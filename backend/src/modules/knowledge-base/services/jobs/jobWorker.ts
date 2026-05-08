/**
 * 파일: backend/src/modules/knowledge-base/services/jobs/jobWorker.ts
 * 역할: KB_INDEX_JOBS 테이블을 1초 간격으로 폴링하는 단일 워커.
 *       SELECT FOR UPDATE SKIP LOCKED으로 동시 충돌 없이 잡 하나씩 처리.
 *       KB_WORKER_ENABLED=false이면 기동하지 않음.
 *
 * 연관 파일:
 *   - services/jobs/jobHandlers.ts       : KIND별 실제 처리
 *   - repository/kbJobRepository.ts      : dequeueJob, markDone, markFailed
 *   - infra/oracle/withTransaction.ts    : 트랜잭션 래퍼
 *   - server.ts                          : startWorker() 호출
 */

import { env } from '../../../../config/env.js';
import { withOracleTransaction } from '../../../../infra/oracle/withTransaction.js';
import { withOracleConnection } from '../../../../infra/oracle/withConnection.js';
import {
  dequeueJob,
  markDone,
  markFailed,
} from '../../repository/kbJobRepository.js';
import {
  handleParse,
  handleChunk,
  handleEmbed,
  handleReindex,
  handleDownloadUrl,
} from './jobHandlers.js';
import { syncTextIndex } from '../../repository/kbChunkRepository.js';

let workerTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

async function processNext(): Promise<void> {
  if (running) return;
  running = true;

  try {
    let syncAfter = false;

    // 1. 잡 추출 (별도 트랜잭션으로 즉시 커밋)
    const job = await withOracleTransaction(async (conn) => {
      return await dequeueJob(conn);
    });

    if (!job) return;

    console.log(`[worker] 잡 시작: ${job.id} (kind=${job.kind}, doc=${job.docId})`);

    try {
      // 2. 실제 작업 (성공 시에만 커밋, 실패 시 자동 롤백)
      await withOracleTransaction(async (conn) => {
        switch (job.kind) {
          case 'parse':        await handleParse(conn, job);        break;
          case 'chunk':        await handleChunk(conn, job);        break;
          case 'embed':        await handleEmbed(conn, job);        break;
          case 'reindex':      await handleReindex(conn, job);      break;
          case 'download_url': await handleDownloadUrl(conn, job);  break;
          default:
            throw new Error(`알 수 없는 잡 kind: ${job.kind}`);
        }
        // 작업 완료 처리도 이 트랜잭션에 포함
        await markDone(conn, job.id);
      });

      if (job.kind === 'embed' || job.kind === 'download_url') syncAfter = true;
      console.log(`[worker] 잡 완료: ${job.id}`);
    } catch (err: any) {
      // 3. 작업 실패 (2번 트랜잭션은 롤백됨) -> 실패 상태만 별도 트랜잭션으로 기록
      const msg = err?.message ?? String(err);
      console.error(`[worker] 잡 실패: ${job.id} — ${msg}`);

      await withOracleTransaction(async (conn) => {
        await markFailed(conn, job.id, msg);
      });
    }

    if (syncAfter) {
      await withOracleConnection(conn => syncTextIndex(conn));
    }
  } catch (err: any) {
    console.warn(`[worker] 처리 오류: ${err.message}`);
  } finally {
    running = false;
  }
}

/** 이전 프로세스 충돌로 'running' 상태에 멈춘 잡을 'queued'로 복원 */
async function recoverStuckJobs(isStartup = false): Promise<void> {
  try {
    await withOracleTransaction(async (conn) => {
      const condition = isStartup 
        ? `STATUS = 'running'` 
        : `STATUS = 'running' AND STARTED_AT < SYSTIMESTAMP - INTERVAL '30' MINUTE`;

      const result = await conn.execute(
        `UPDATE KB_INDEX_JOBS
         SET STATUS = 'queued', ATTEMPTS = GREATEST(ATTEMPTS - 1, 0)
         WHERE ${condition}`,
        {},
        { autoCommit: false },
      );
      if (result.rowsAffected && result.rowsAffected > 0) {
        console.log(`[worker] ${result.rowsAffected}개의 멈춘 잡을 큐로 복원했습니다.`);
      }
    });
  } catch (err: any) {
    // 복원 실패는 무시 — 잡이 missed될 뿐 시스템 오류 아님
    console.warn(`[worker] 멈춘 잡 복원 중 오류: ${err.message}`);
  }
}

let recoverTimer: ReturnType<typeof setInterval> | null = null;

/** 워커 시작. KB_WORKER_ENABLED=false이면 no-op. */
export function startWorker(): void {
  if (!env.KB_WORKER_ENABLED) {
    console.log('[worker] KB_WORKER_ENABLED=false — 워커 비활성');
    return;
  }

  console.log('[worker] KB 인덱싱 워커 시작');

  // 이전 충돌로 멈춘 잡 복원 후 폴링 시작
  recoverStuckJobs(true).finally(() => {
    function tick() {
      processNext().finally(() => {
        workerTimer = setTimeout(tick, 1000);
      });
    }
    tick();

    // 5분마다 30분 이상 멈춰있는 잡을 복원
    recoverTimer = setInterval(() => {
      recoverStuckJobs(false);
    }, 5 * 60 * 1000);
  });
}

/** 워커 정지 (테스트/종료용) */
export function stopWorker(): void {
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  if (recoverTimer) {
    clearInterval(recoverTimer);
    recoverTimer = null;
  }
}
