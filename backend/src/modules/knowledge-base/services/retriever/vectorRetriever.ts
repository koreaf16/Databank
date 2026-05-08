/**
 * 파일: backend/src/modules/knowledge-base/services/retriever/vectorRetriever.ts
 * 역할: 질의를 AI_MODELS embedding 모델로 임베딩 후 VECTOR_DISTANCE COSINE 검색.
 *
 * 연관 파일:
 *   - services/ai/aiModelResolver.ts    : resolveModel
 *   - services/embedder/ollamaEmbedder  : embedText
 *   - repository/kbChunkRepository.ts  : vectorSearch
 *   - services/retriever/hybridFusion   : RRF 융합 입력
 */

import { embedText } from '../embedder/ollamaEmbedder.js';
import { vectorSearch } from '../../repository/kbChunkRepository.js';
import { resolveModel } from '../ai/aiModelResolver.js';
import type { ScoredChunk } from './bm25Retriever.js';

export async function vectorRetrieve(
  connection: any,
  query: string,
  topK: number = 50,
): Promise<ScoredChunk[]> {
  const cfg = await resolveModel(connection, 'embedding');
  const { embedding } = await embedText(query, cfg);
  const rows = await vectorSearch(connection, embedding, topK);
  return rows.map((r) => ({
    id:            r.id,
    docId:         r.docId,
    fileId:        r.fileId,
    ordinal:       r.ordinal,
    headingPath:   r.headingPath,
    pageFrom:      r.pageFrom,
    pageTo:        r.pageTo,
    tokenCount:    r.tokenCount,
    contentText:   r.contentText,
    contextPrefix: r.contextPrefix,
    score:         r.score,
  }));
}
