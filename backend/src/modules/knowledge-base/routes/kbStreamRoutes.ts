/**
 * 파일: backend/src/modules/knowledge-base/routes/kbStreamRoutes.ts
 * 역할: 인덱싱 잡 진행률을 SSE로 푸시하는 라우트.
 *       GET /api/kb/events/jobs?ids=j1,j2,j3
 *
 * 연관 파일:
 *   - repository/kbJobRepository.ts : getJobProgress
 *   - routes/kbUploadRoutes.ts      : 업로드 후 jobIds 반환
 */

import { Router } from 'express';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { requireOracle } from '../../../http/errorHandler.js';
import {
  getJobProgress,
  listJobsByDoc,
  listRecentJobs,
  cancelJob,
  deleteJob,
  deleteCompletedJobs,
} from '../repository/kbJobRepository.js';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok } from '../../../http/apiResponse.js';

export const kbStreamRouter = Router();

/** GET /api/kb/jobs — 최근 잡 목록 (문서 제목 포함) */
kbStreamRouter.get('/jobs', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const jobs = await withOracleConnection((conn) => listRecentJobs(conn, 200));
  ok(res, jobs);
}));

/** POST /api/kb/jobs/:id/cancel — 잡 취소 */
kbStreamRouter.post('/jobs/:id/cancel', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const affected = await withOracleConnection((conn) => cancelJob(conn, req.params.id));
  if (affected === 0) {
    res.status(400).json({ ok: false, error: { code: 'CANCEL_FAILED', message: '취소할 수 없는 상태입니다' } });
    return;
  }
  ok(res, { cancelled: true });
}));

/** DELETE /api/kb/jobs/bulk-completed — 완료/실패/취소된 모든 잡 일괄 삭제 */
kbStreamRouter.delete('/jobs/bulk-completed', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const deletedCount = await withOracleConnection((conn) => deleteCompletedJobs(conn));
  ok(res, { deletedCount });
}));

/** DELETE /api/kb/jobs/:id — 잡 삭제 (done/failed/cancelled만 허용) */
kbStreamRouter.delete('/jobs/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const affected = await withOracleConnection((conn) => deleteJob(conn, req.params.id));
  if (affected === 0) {
    res.status(400).json({ ok: false, error: { code: 'DELETE_FAILED', message: '삭제할 수 없는 상태입니다' } });
    return;
  }
  ok(res, { deleted: true });
}));

/**
 * GET /api/kb/events/jobs?ids=j1,j2
 * 잡 ID 목록의 진행률을 SSE로 푸시한다.
 * parse→chunk→embed 체인: 잡 완료 후 같은 docId의 후속 잡이 있으면 계속 추적.
 */
kbStreamRouter.get('/events/jobs', async (req, res) => {
  if (!requireOracle(res)) return;

  const idsRaw = String(req.query.ids ?? '');
  let trackedIds = idsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  if (trackedIds.length === 0) {
    res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'ids 파라미터가 필요합니다' } });
    return;
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  function sendData(data: unknown) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  let closed = false;
  let timer: ReturnType<typeof setTimeout>;

  async function poll() {
    try {
      const jobs = await withOracleConnection((conn) => getJobProgress(conn, trackedIds));
      sendData({ jobs });

      const allDone = jobs.every((j) => j.status === 'done' || j.status === 'failed');
      if (allDone) {
        // parse→chunk→embed 체인: 완료된 잡의 docId로 후속 잡 탐색
        const successorIds = await withOracleConnection(async (conn) => {
          const ids: string[] = [];
          for (const j of jobs) {
            if (j.status !== 'done' || !j.docId) continue;
            const all = await listJobsByDoc(conn, j.docId);
            // 현재 추적 목록에 없는 queued/running 잡
            const next = all.find(
              (s) => !trackedIds.includes(s.id) && (s.status === 'queued' || s.status === 'running'),
            );
            if (next) ids.push(next.id);
          }
          return ids;
        });

        if (successorIds.length > 0) {
          // 후속 잡이 있으면 추적 목록에 추가하고 계속 폴링
          trackedIds = [...trackedIds, ...successorIds];
        } else {
          res.write('event: close\ndata: {}\n\n');
          res.end();
          closed = true;
          return;
        }
      }
    } catch {
      // DB 오류 시 조용히 재시도
    }

    if (!closed) {
      timer = setTimeout(poll, 1000);
    }
  }

  req.on('close', () => {
    closed = true;
    clearTimeout(timer);
  });

  await poll();
});
