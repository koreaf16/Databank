/**
 * 파일: backend/src/modules/knowledge-base/services/chunker/structuralChunker.ts
 * 역할: ParseResult의 블록을 heading 단위로 1차 분할한다.
 *       heading이 나타나면 현재 섹션을 청크로 확정하고 새 섹션 시작.
 *       표/코드 블록은 분할 금지(원자성 보존).
 *
 * 연관 파일:
 *   - services/parsers/parserRegistry.ts : ParseBlock, ParseResult
 *   - services/chunker/tokenChunker.ts   : 2차 토큰 사이즈 보정
 *   - services/jobs/jobHandlers.ts       : chunk 잡에서 호출
 */

import type { ParseBlock, ParseResult } from '../parsers/parserRegistry.js';

export interface RawChunk {
  headingPath: string;
  blocks: ParseBlock[];
  pageFrom: number | null;
  pageTo: number | null;
}

/**
 * heading 경로를 "1단계 > 2단계" 형태로 관리한다.
 */
function buildHeadingPath(stack: Array<{ level: number; text: string }>): string {
  return stack.map((h) => h.text).join(' > ');
}

/**
 * 블록 배열을 heading 단위 섹션으로 분리한다.
 * headingLevel 이상의 heading이 나타날 때 새 섹션 시작.
 */
export function splitByHeadings(result: ParseResult): RawChunk[] {
  const chunks: RawChunk[] = [];
  let current: ParseBlock[] = [];
  let headingStack: Array<{ level: number; text: string }> = [];
  let pageFrom: number | null = null;
  let pageTo: number | null = null;

  function flushCurrent() {
    if (current.length === 0) return;
    const textBlocks = current.filter((b) => b.text.trim());
    if (textBlocks.length === 0) return;
    chunks.push({
      headingPath: buildHeadingPath(headingStack),
      blocks: [...current],
      pageFrom,
      pageTo,
    });
    current = [];
    pageFrom = null;
    pageTo = null;
  }

  for (const block of result.blocks) {
    // 페이지 추적
    if (block.page != null) {
      if (pageFrom == null) pageFrom = block.page;
      pageTo = block.page;
    }

    if (block.kind === 'heading') {
      flushCurrent();
      const level = block.level ?? 1;
      // heading 스택에서 같은 레벨 이상의 항목 제거
      headingStack = headingStack.filter((h) => h.level < level);
      headingStack.push({ level, text: block.text });
      // heading 자체도 블록에 포함
      current.push(block);
      continue;
    }

    current.push(block);
  }

  flushCurrent();

  // 청크가 없으면 전체를 하나로
  if (chunks.length === 0 && result.blocks.length > 0) {
    const textBlocks = result.blocks.filter((b) => b.text.trim());
    if (textBlocks.length > 0) {
      chunks.push({
        headingPath: '',
        blocks: result.blocks,
        pageFrom: result.blocks.find((b) => b.page != null)?.page ?? null,
        pageTo: result.blocks.findLast((b) => b.page != null)?.page ?? null,
      });
    }
  }

  return chunks;
}

/** RawChunk를 평문 텍스트로 직렬화 */
export function chunkToText(chunk: RawChunk): string {
  const parts: string[] = [];
  if (chunk.headingPath) parts.push(`# ${chunk.headingPath}`);
  for (const b of chunk.blocks) {
    if (b.kind === 'heading') {
      const prefix = '#'.repeat(b.level ?? 1);
      parts.push(`${prefix} ${b.text}`);
    } else if (b.kind === 'table') {
      parts.push(b.text);
    } else {
      parts.push(b.text);
    }
  }
  return parts.join('\n').trim();
}
