/**
 * 파일: backend/src/modules/knowledge-base/services/retriever/rerankRetriever.ts
 * 역할: AI_MODELS reranker 모델로 후보 청크를 재정렬한다.
 *       endpoint는 전체 URL(예: http://host/rerank)로 저장된다.
 *       호출 실패 시 원본 순서 그대로 반환.
 *
 * 연관 파일:
 *   - services/ai/aiModelResolver.ts    : resolveModel
 *   - services/retriever/hybridFusion   : FusedChunk 입력/출력
 */

import axios from 'axios';
import { resolveModel } from '../ai/aiModelResolver.js';
import type { FusedChunk } from './hybridFusion.js';

export interface RankedChunk extends FusedChunk {
  rerankScore: number;
}

/**
 * Ollama /api/rerank으로 후보 청크를 재정렬한다.
 * 모델이 미등록이거나 호출 실패 시 원본 FusedChunk 순서 반환.
 */
export async function rerankChunks(
  connection: any,
  query: string,
  chunks: FusedChunk[],
): Promise<RankedChunk[]> {
  if (chunks.length === 0) return [];

  let cfg;
  try {
    cfg = await resolveModel(connection, 'reranker');
  } catch {
    return chunks.map((c) => ({ ...c, rerankScore: c.rrfScore }));
  }

  // reranker 미설정(폴백 모델명이 'bge-reranker-v2-m3'이면 실제 등록 여부 불분명)
  // AI_MODELS에 실제 행이 없으면 캐시에 폴백값이 들어가므로 그냥 진행
  try {
    const url = cfg.endpoint;
    if (!url) return chunks.map((c) => ({ ...c, rerankScore: c.rrfScore }));
    const documents = chunks.map((c) => c.contentText);
    const headers = cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};

    const response = await axios.post(
      url,
      { model: cfg.modelName, query, documents },
      { timeout: 30_000, headers },
    );

    // 응답 형식 통일: 배열 직접({score,index}) 또는 {results:[{relevance_score,index}]}
    const raw: any[] = Array.isArray(response.data)
      ? response.data
      : (response.data?.results ?? []);

    if (raw.length !== chunks.length) {
      return chunks.map((c) => ({ ...c, rerankScore: c.rrfScore }));
    }

    const scoresByIndex = new Map<number, number>();
    for (const item of raw) {
      scoresByIndex.set(item.index ?? 0, item.score ?? item.relevance_score ?? 0);
    }

    const reranked = chunks.map((chunk, index) => ({
      ...chunk,
      rerankScore: scoresByIndex.get(index) ?? chunk.rrfScore,
    }));

    const scores = reranked.map((item) => item.rerankScore);
    const scoreSpread = Math.max(...scores) - Math.min(...scores);
    if (scoreSpread < 0.01) {
      return reranked;
    }

    return reranked.sort((a, b) => b.rerankScore - a.rerankScore);
  } catch {
    // 리랭커 호출 실패 시 원본 순서 유지 (검색 서비스 중단 없이 graceful degradation)
    return chunks.map((c) => ({ ...c, rerankScore: c.rrfScore }));
  }
}
