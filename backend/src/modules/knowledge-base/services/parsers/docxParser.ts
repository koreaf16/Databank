/**
 * 파일: backend/src/modules/knowledge-base/services/parsers/docxParser.ts
 * 역할: DOCX 파일에서 텍스트와 블록을 추출한다.
 *       mammoth로 HTML 변환 후 cheerio로 heading/paragraph/list/table 분류.
 *
 * 연관 파일:
 *   - services/parsers/parserRegistry.ts : 등록
 */

import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import {
  type DocumentParser,
  type ParseResult,
  type ParseBlock,
  registerParser,
} from './parserRegistry.js';

const DOCX_MIMES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

const docxParser: DocumentParser = {
  mimeTypes: DOCX_MIMES,

  async parse(buffer: Buffer, _filename: string): Promise<ParseResult> {
    let html = '';
    try {
      const result = await mammoth.convertToHtml({ buffer });
      html = result.value;
    } catch (err: any) {
      return {
        text: '',
        blocks: [],
        meta: { title: `[DOCX 파싱 오류: ${err.message?.slice(0, 80) ?? 'unknown'}]` },
      };
    }

    const $ = cheerio.load(html);
    const blocks: ParseBlock[] = [];

    $('h1,h2,h3,h4,h5,h6,p,ul,ol,table').each((_i, el) => {
      const tag = (el as any).tagName?.toLowerCase() ?? 'p';
      const text = $(el).text().trim();
      if (!text) return;

      if (/^h[1-6]$/.test(tag)) {
        const level = Number(tag[1]);
        blocks.push({ kind: 'heading', level, text });
        return;
      }
      if (tag === 'ul' || tag === 'ol') {
        $(el)
          .find('li')
          .each((_j, li) => {
            const liText = $(li).text().trim();
            if (liText) blocks.push({ kind: 'list', text: liText });
          });
        return;
      }
      if (tag === 'table') {
        const rows: string[] = [];
        $(el)
          .find('tr')
          .each((_j, tr) => {
            const cells = $(tr)
              .find('td,th')
              .map((_k, td) => $(td).text().trim())
              .get()
              .join(' | ');
            if (cells) rows.push(cells);
          });
        if (rows.length) blocks.push({ kind: 'table', text: rows.join('\n') });
        return;
      }
      blocks.push({ kind: 'paragraph', text });
    });

    const text = blocks.map((b) => b.text).join('\n');
    return { text, blocks, meta: {} };
  },
};

registerParser(docxParser);
export default docxParser;
