/**
 * 파일: backend/src/modules/knowledge-base/services/parsers/textParser.ts
 * 역할: TXT/MD/HTML 파일에서 텍스트와 블록을 추출한다.
 *       마크다운 heading(#~######) 패턴으로 heading 블록을 분류.
 *
 * 연관 파일:
 *   - services/parsers/parserRegistry.ts : 등록
 */

import {
  type DocumentParser,
  type ParseResult,
  type ParseBlock,
  registerParser,
} from './parserRegistry.js';

const textParser: DocumentParser = {
  mimeTypes: ['text/plain', 'text/markdown', 'text/html', 'text/htm'],

  async parse(buffer: Buffer, _filename: string): Promise<ParseResult> {
    const raw = buffer.toString('utf-8');
    // HTML이면 태그 제거
    const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();

    const lines = text.split('\n');
    const blocks: ParseBlock[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 마크다운 heading
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        blocks.push({
          kind: 'heading',
          level: headingMatch[1].length,
          text: headingMatch[2].trim(),
        });
        continue;
      }

      // 리스트 아이템
      if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
        blocks.push({ kind: 'list', text: trimmed.replace(/^[-*+\d.]\s+/, '') });
        continue;
      }

      blocks.push({ kind: 'paragraph', text: trimmed });
    }

    return { text, blocks, meta: {} };
  },
};

registerParser(textParser);
export default textParser;
