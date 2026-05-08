/**
 * 파일: backend/src/modules/knowledge-base/services/chunker/tokenChunker.ts
 * 역할: structuralChunker의 RawChunk를 토큰 사이즈 기준으로 2차 분할한다.
 *       표/코드 블록은 분할하지 않는다(원자성 보존).
 *       한국어 기준 1토큰 ≈ 1.5~2자로 추정(정확한 tiktoken 없이 간이 계산).
 *
 * 연관 파일:
 *   - services/chunker/structuralChunker.ts : RawChunk 입력
 *   - services/jobs/jobHandlers.ts           : chunk 잡에서 호출
 *   - config/env.ts                          : KB_CHUNK_TARGET_TOKENS, OVERLAP
 */

import type { RawChunk } from './structuralChunker.js';
import type { ParseBlock } from '../parsers/parserRegistry.js';
import { env } from '../../../../config/env.js';

export interface FinalChunk {
  headingPath: string;
  contentText: string;
  pageFrom: number | null;
  pageTo: number | null;
  tokenCount: number;
}

/** 간이 토큰 수 추정 (한국어 포함 시 1.5자 ≈ 1토큰) */
function estimateTokens(text: string): number {
  const hanCount = (text.match(/[ㄱ-힣]/g) ?? []).length;
  const asciiCount = text.length - hanCount;
  return Math.ceil(hanCount / 1.5 + asciiCount / 4);
}

/** 문단/문장 경계로 텍스트를 분리 */
function splitSentences(text: string): string[] {
  // 마침표·느낌표·물음표·줄바꿈 기준 분리 (한국어 "다." 패턴 포함)
  return text
    .split(/(?<=[.!?。]\s)|(?<=다\.\s)|(?<=다[?!]\s)|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 단일 RawChunk를 maxTokens 이하로 분할한다.
 * 표/코드는 한 덩어리로 유지.
 */
function splitChunk(chunk: RawChunk): FinalChunk[] {
  const maxTokens = env.KB_CHUNK_TARGET_TOKENS;
  const overlap = env.KB_CHUNK_OVERLAP_TOKENS;
  const text = buildChunkText(chunk);
  const tokenCount = estimateTokens(text);

  if (tokenCount <= maxTokens) {
    return [{
      headingPath: chunk.headingPath,
      contentText: text,
      pageFrom: chunk.pageFrom,
      pageTo: chunk.pageTo,
      tokenCount,
    }];
  }

  // 분할 필요: 표/코드는 별도 원자 블록으로 추출
  const atomicBlocks: Array<{ text: string; isAtomic: boolean }> = chunk.blocks.map((b) => ({
    text: b.kind === 'table' || b.kind === 'code' ? b.text : b.text,
    isAtomic: b.kind === 'table' || b.kind === 'code',
  }));

  const result: FinalChunk[] = [];
  let buffer: string[] = [];
  let bufTokens = 0;
  const headingPrefix = chunk.headingPath ? `# ${chunk.headingPath}\n` : '';

  function flush(overlapLines: string[]) {
    if (buffer.length === 0) return;
    const content = headingPrefix + buffer.join('\n');
    result.push({
      headingPath: chunk.headingPath,
      contentText: content.trim(),
      pageFrom: chunk.pageFrom,
      pageTo: chunk.pageTo,
      tokenCount: estimateTokens(content),
    });
    // 다음 청크에 오버랩
    buffer = overlapLines.slice(-3); // 마지막 3문장 오버랩
    bufTokens = estimateTokens(buffer.join('\n'));
  }

  for (const item of atomicBlocks) {
    if (item.isAtomic) {
      // 원자 블록: 현재 버퍼 플러시 후 독립 청크
      if (buffer.length > 0) flush([]);
      result.push({
        headingPath: chunk.headingPath,
        contentText: (headingPrefix + item.text).trim(),
        pageFrom: chunk.pageFrom,
        pageTo: chunk.pageTo,
        tokenCount: estimateTokens(item.text),
      });
      continue;
    }

    const sentences = splitSentences(item.text);
    for (const sent of sentences) {
      const sentTokens = estimateTokens(sent);
      if (bufTokens + sentTokens > maxTokens && buffer.length > 0) {
        flush(buffer);
      }
      buffer.push(sent);
      bufTokens += sentTokens;
    }
  }

  if (buffer.length > 0) flush([]);
  return result;
}

function buildChunkText(chunk: RawChunk): string {
  const parts: string[] = [];
  if (chunk.headingPath) parts.push(`# ${chunk.headingPath}`);
  for (const b of chunk.blocks) {
    if (b.kind === 'heading') {
      parts.push(`${'#'.repeat(b.level ?? 1)} ${b.text}`);
    } else {
      parts.push(b.text);
    }
  }
  return parts.join('\n').trim();
}

/** RawChunk 배열을 FinalChunk 배열로 변환 */
export function toFinalChunks(rawChunks: RawChunk[]): FinalChunk[] {
  return rawChunks.flatMap(splitChunk);
}
