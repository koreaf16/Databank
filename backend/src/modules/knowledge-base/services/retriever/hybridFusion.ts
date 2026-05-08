/**
 * 파일: backend/src/modules/knowledge-base/services/retriever/hybridFusion.ts
 * 역할: BM25 + Vector → RRF(k=60) 융합 후 리랭커로 최종 정렬.
 *       mode='vector' 시 BM25 생략, 벡터 검색 + 리랭커만 수행.
 *       리랭커는 AI_MODELS reranker 모델을 사용하며, 미설정 시 RRF 순서 사용.
 *
 * 연관 파일:
 *   - services/retriever/bm25Retriever    : BM25 결과
 *   - services/retriever/vectorRetriever  : Vector 결과
 *   - services/retriever/rerankRetriever  : 리랭커 재정렬
 *   - routes/kbSearchRoutes.ts            : 검색 라우트에서 호출
 */

import type { ScoredChunk } from './bm25Retriever.js';

export type RetrieverSource = 'bm25' | 'vector' | 'both';

export interface FusedChunk extends ScoredChunk {
  rrfScore: number;
  source: RetrieverSource;
}

const RRF_K = 60;

export function reciprocalRankFusion(
  bm25Results: ScoredChunk[],
  vectorResults: ScoredChunk[],
  topK: number = 50,
): FusedChunk[] {
  const scoreMap = new Map<string, { chunk: ScoredChunk; rrfScore: number; source: RetrieverSource }>();

  bm25Results.forEach((chunk, idx) => {
    const rrf = 1 / (RRF_K + idx + 1);
    scoreMap.set(chunk.id, { chunk, rrfScore: rrf, source: 'bm25' });
  });

  vectorResults.forEach((chunk, idx) => {
    const rrf = 1 / (RRF_K + idx + 1);
    const existing = scoreMap.get(chunk.id);
    if (existing) {
      existing.rrfScore += rrf;
      existing.source = 'both';
    } else {
      scoreMap.set(chunk.id, { chunk, rrfScore: rrf, source: 'vector' });
    }
  });

  return Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK)
    .map(({ chunk, rrfScore, source }) => ({ ...chunk, rrfScore, source }));
}

/**
 * BM25 + Vector 병렬 검색 → RRF 융합 → 리랭커 재정렬.
 * mode='vector': BM25 생략, vectorRetrieve만 호출 후 리랭크.
 * mode='hybrid': 기존 BM25+Vector RRF 로직.
 */
export async function hybridSearch(
  connection: any,
  query: string,
  topK: number = 10,
  rerankTopK: number = 50,
  mode: 'vector' | 'hybrid' = 'hybrid',
): Promise<FusedChunk[]> {
  const { vectorRetrieve } = await import('./vectorRetriever.js');
  const { rerankChunks } = await import('./rerankRetriever.js');

  if (mode === 'vector') {
    const vectorResult = await vectorRetrieve(connection, query, rerankTopK);
    const fused: FusedChunk[] = vectorResult.map((c) => ({ ...c, rrfScore: 0, source: 'vector' as RetrieverSource }));
    const reranked = await rerankChunks(connection, query, fused);
    return reranked.slice(0, topK);
  }

  const { bm25Search } = await import('./bm25Retriever.js');

  const [bm25, vector] = await Promise.allSettled([
    bm25Search(connection, query, rerankTopK),
    vectorRetrieve(connection, query, rerankTopK),
  ]);

  const bm25Results = bm25.status === 'fulfilled' ? bm25.value : [];
  const vectorResults = vector.status === 'fulfilled' ? vector.value : [];

  const fused = reciprocalRankFusion(bm25Results, vectorResults, rerankTopK);

  const reranked = await rerankChunks(connection, query, fused);
  return reranked.slice(0, topK);
}
