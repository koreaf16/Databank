/**
 * 파일: backend/src/modules/knowledge-base/services/embedder/batchEmbedder.ts
 * 역할: 청크 배열을 16개 단위 배치로 임베딩하고 DB를 갱신한다.
 *       AI_MODELS 테이블에서 embedding 기본 모델을 조회해 사용.
 *       실패 시 지수 백오프(1s/4s/16s) 3회 재시도.
 *
 * 연관 파일:
 *   - services/ai/aiModelResolver.ts    : resolveModel
 *   - services/embedder/ollamaEmbedder  : embedTexts
 *   - repository/kbChunkRepository.ts  : updateEmbedding
 *   - services/jobs/jobHandlers.ts      : embed 잡에서 호출
 */

import { embedTexts } from './ollamaEmbedder.js';
import { updateEmbedding } from '../../repository/kbChunkRepository.js';
import { updateProgress } from '../../repository/kbJobRepository.js';
import { resolveModel } from '../ai/aiModelResolver.js';
import { env } from '../../../../config/env.js';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  const delays = [1000, 4000, 16000];
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await sleep(delays[i]);
    }
  }
  throw new Error('재시도 한도 초과');
}

/**
 * chunks 배열을 BATCH_SIZE 단위로 임베딩 후 DB 갱신.
 * connection은 커밋하지 않음(caller 책임).
 */
export async function embedAndSaveChunks(
  connection: any,
  jobId: string,
  chunks: Array<{ id: string; contentText: string; contextPrefix?: string | null }>,
  progressFrom = 0,
  progressTo = 100,
): Promise<void> {
  const cfg = await resolveModel(connection, 'embedding');

  const batchSize = env.KB_EMBED_BATCH_SIZE;
  const total = chunks.length;
  let done = 0;

  for (let start = 0; start < total; start += batchSize) {
    const batch = chunks.slice(start, start + batchSize);
    const texts = batch.map((c) =>
      c.contextPrefix ? `${c.contextPrefix}\n\n${c.contentText}` : c.contentText,
    );

    const results = await withRetry(() => embedTexts(texts, cfg));

    for (let j = 0; j < batch.length; j++) {
      await updateEmbedding(connection, batch[j].id, results[j].embedding, results[j].model);
      done++;
    }

    const scaled = Math.round(progressFrom + (done / total) * (progressTo - progressFrom));
    await updateProgress(connection, jobId, scaled, 'embed');
  }
}
