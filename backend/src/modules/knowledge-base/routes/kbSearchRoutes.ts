/**
 * 파일: backend/src/modules/knowledge-base/routes/kbSearchRoutes.ts
 * 역할: 하이브리드 검색(/search/hybrid)과 AI 답변(/ask) 라우트.
 *       AI_MODELS에서 embedding·reranker·llm 모델을 동적으로 조회해 사용.
 *       /ask는 SSE로 LLM 토큰을 실시간 스트리밍한다.
 *
 * 연관 파일:
 *   - services/retriever/hybridFusion       : BM25+Vector+RRF+Rerank
 *   - services/generator/promptBuilder      : buildMessages
 *   - services/generator/llmRouter          : streamChat (AI_MODELS 조회)
 *   - services/generator/citationExtractor  : extractCitations
 *   - infra/oracle/withConnection.ts        : DB 연결
 */

import { Router } from 'express';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { hybridSearch } from '../services/retriever/hybridFusion.js';
import { buildMessages } from '../services/generator/promptBuilder.js';
import { streamChat } from '../services/generator/llmRouter.js';
import { extractCitations } from '../services/generator/citationExtractor.js';

type SearchMode = 'vector' | 'hybrid';

export const kbSearchRouter = Router();

// ── POST /api/kb/search/hybrid ────────────────────────────────────────────────

kbSearchRouter.post('/search/hybrid', async (req, res) => {
  if (!requireOracle(res)) return;

  const { query, topK = 10, mode = 'hybrid' } = req.body as { query?: string; topK?: number; mode?: string };

  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'query 파라미터가 필요합니다' },
    });
    return;
  }

  const resolvedMode: SearchMode = mode === 'vector' ? 'vector' : 'hybrid';
  const k = Math.min(Math.max(Number(topK) || 10, 1), 50);

  try {
    const chunks = await withOracleConnection((conn) =>
      hybridSearch(conn, query.trim(), k, undefined, resolvedMode),
    );

    const messages = buildMessages(query.trim(), chunks);

    res.json({
      ok: true,
      data: {
        query: query.trim(),
        mode: resolvedMode,
        total: chunks.length,
        messages,
        chunks: chunks.map((c, i) => ({
          num:         i + 1,
          id:          c.id,
          docId:       c.docId,
          fileId:      c.fileId,
          headingPath: c.headingPath,
          pageFrom:    c.pageFrom,
          pageTo:      c.pageTo,
          tokenCount:  c.tokenCount,
          contentText: c.contentText,
          rrfScore:    c.rrfScore,
          rerankScore: (c as any).rerankScore ?? null,
          source:      c.source,
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: { code: 'SEARCH_ERROR', message: err.message ?? '검색 중 오류가 발생했습니다' },
    });
  }
});

// ── POST /api/kb/ask ──────────────────────────────────────────────────────────
// SSE: 검색 → 리랭크 → 프롬프트 → LLM 스트리밍 → 인용 전송

kbSearchRouter.post('/ask', async (req, res) => {
  if (!requireOracle(res)) return;

  const { query, topK = 10, mode = 'hybrid' } = req.body as { query?: string; topK?: number; mode?: string };

  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'query 파라미터가 필요합니다' },
    });
    return;
  }

  const resolvedMode: SearchMode = mode === 'vector' ? 'vector' : 'hybrid';
  const k = Math.min(Math.max(Number(topK) || 10, 1), 50);

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  let aborted = false;

  function isStreamOpen(): boolean {
    return !aborted && !res.destroyed && !res.writableEnded;
  }

  function sendEvent(event: string, data: unknown): boolean {
    if (!isStreamOpen()) return false;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  }

  req.on('aborted', () => { aborted = true; });
  res.on('close', () => {
    if (!res.writableEnded) aborted = true;
  });

  // 단일 커넥션으로 검색부터 LLM까지 처리
  await withOracleConnection(async (conn) => {
    try {
      // 1. 검색 + 리랭크
      const chunks = await hybridSearch(conn, query.trim(), k, undefined, resolvedMode);

      if (aborted) return;

      const numberedChunks = chunks.map((c, i) => ({
        num:         i + 1,
        id:          c.id,
        docId:       c.docId,
        headingPath: c.headingPath,
        pageFrom:    c.pageFrom,
        pageTo:      c.pageTo,
        contentText: c.contentText,
        rrfScore:    c.rrfScore,
        rerankScore: (c as any).rerankScore ?? null,
        source:      c.source,
      }));

      // 2. 검색 결과 전송
      if (!sendEvent('chunks', { chunks: numberedChunks })) return;

      if (chunks.length === 0) {
        sendEvent('answer', { text: '관련 자료를 찾지 못했습니다. 다른 검색어를 시도해 보세요.' });
        sendEvent('done', { citations: [] });
        return;
      }

      // 3. 프롬프트 빌드 → 프롬프트 이벤트 전송 → LLM 스트리밍
      const messages = buildMessages(query.trim(), chunks);

      if (!sendEvent('prompt', { messages })) return;
      let fullAnswer = '';

      await streamChat(conn, messages, ({ token, done }) => {
        if (aborted) return;
        if (token) {
          fullAnswer += token;
          sendEvent('token', { token });
        }
        if (done) {
          const citations = extractCitations(fullAnswer, chunks);
          sendEvent('done', { citations });
        }
      });
    } catch (err: any) {
      if (!aborted) {
        sendEvent('error', {
          code: 'ASK_ERROR',
          message: err.message ?? 'AI 답변 생성 중 오류가 발생했습니다',
        });
      }
    }
  });

  if (!res.destroyed && !res.writableEnded) res.end();
});
