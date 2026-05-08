/**
 * 파일: frontend/src/features/knowledge-base/api/kbSearchApi.ts
 * 역할: 하이브리드 검색(/search/hybrid)과 AI 답변 SSE(/ask) API 호출.
 *
 * 연관 파일:
 *   - shared/api/apiClient.ts          : apiPost
 *   - shared/api/sseClient.ts          : postSseStream
 *   - components/KbChunkList.tsx       : 검색 결과 렌더
 *   - components/KbAskPanel.tsx        : AI 답변 스트리밍
 *   - backend/routes/kbSearchRoutes.ts : POST /api/kb/search/hybrid, /api/kb/ask
 */

import { apiPost } from '../../../shared/api/apiClient.js';
import { postSseStream } from '../../../shared/api/sseClient.js';

/**
 * 검색 (BM25 + Vector RRF 하이브리드 또는 Vector 단독).
 * mode: 'hybrid'(기본) | 'vector'
 * 결과: { query, mode, total, messages, chunks: [{num, id, docId, headingPath, pageFrom, contentText, rrfScore, rerankScore, source}] }
 */
export async function hybridSearch(query, topK = 10, mode = 'hybrid') {
  return apiPost('/api/kb/search/hybrid', { query, topK, mode });
}

/**
 * AI 답변 SSE 스트리밍.
 *
 * 이벤트 순서:
 *   1. 'chunks'  — 검색 결과 청크 배열
 *   2. 'prompt'  — LLM 메시지 배열 [{role, content}]
 *   3. 'token'   — LLM 토큰 (여러 번)
 *   4. 'done'    — 인용 배열 { citations: [{num, chunkId, docId, headingPath, pageFrom}] }
 *   5. 'error'   — 오류 시
 *
 * 반환값: abort 함수. 호출 시 SSE 연결 종료.
 */
export function askStream(query, topK = 10, callbacks, mode = 'hybrid') {
  const { onChunks, onPrompt, onToken, onAnswer, onDone, onError } = callbacks;

  return postSseStream(
    '/api/kb/ask',
    { query, topK, mode },
    {
      onEvent(event, data) {
        if (event === 'chunks')      onChunks?.(data.chunks);
        else if (event === 'prompt') onPrompt?.(data.messages);
        else if (event === 'answer') onAnswer?.(data.text ?? '');
        else if (event === 'token')  onToken?.(data.token);
        else if (event === 'done')   onDone?.(data.citations ?? []);
        else if (event === 'error')  onError?.(data.message);
      },
      onError: (msg) => onError?.(msg),
    },
  );
}
