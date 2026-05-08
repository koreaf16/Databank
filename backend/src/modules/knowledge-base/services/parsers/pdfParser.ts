/**
 * 파일: backend/src/modules/knowledge-base/services/parsers/pdfParser.ts
 * 역할: PDF 파일에서 텍스트와 블록을 추출한다.
 *       pdf-parse v2 라이브러리(PDFParse + getText) 사용.
 *       빈 텍스트가 반환되면 스캔 PDF로 간주 (Stage 2 OCR 예정).
 *
 * 연관 파일:
 *   - services/parsers/parserRegistry.ts : 등록
 *   - services/jobs/jobHandlers.ts       : parse 잡에서 호출
 */

import { PDFParse } from 'pdf-parse';
import {
  type DocumentParser,
  type ParseResult,
  registerParser,
} from './parserRegistry.js';

// 멀티레벨 번호 섹션: "1.2 Title", "2.3.1 Details" (마침표 사이 숫자)
const MULTI_LEVEL_RE = /^(\d+(?:\.\d+)+)\.?\s+\S/;
// 단일 번호 섹션: "1 Introduction" (마침표 없이 숫자 + 공백 + 대문자/한글)
const SINGLE_LEVEL_RE = /^\d{1,2}\s+[A-Z가-힣]/;
// "Chapter 1 …", "Appendix A …", "제N장 …"
const CHAPTER_RE = /^(?:chapter|appendix|part)\s+[\dA-Z]/i;
const KO_CHAPTER_RE = /^제\d+[장절]\s+/;

function detectHeading(line: string): { level: number } | null {
  if (line.length > 150) return null;

  const multi = line.match(MULTI_LEVEL_RE);
  if (multi) {
    const level = multi[1].split('.').length;
    return { level: Math.min(level, 4) };
  }

  if (CHAPTER_RE.test(line) || KO_CHAPTER_RE.test(line)) return { level: 1 };

  // 단일 번호 섹션 — 문장이 아닌 짧은 제목으로 보이는 것만
  if (SINGLE_LEVEL_RE.test(line) && line.length <= 120 && !line.endsWith('.')) {
    return { level: 1 };
  }

  return null;
}

const pdfParser: DocumentParser = {
  mimeTypes: ['application/pdf'],

  async parse(buffer: Buffer, _filename: string): Promise<ParseResult> {
    let pageCount = 0;
    let fullText = '';

    try {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText({ pageJoiner: '\f' });
      fullText = result.text ?? '';
      pageCount = result.total ?? 0;
    } catch (err: any) {
      return {
        text: '',
        blocks: [],
        pageCount: 0,
        meta: { title: `[PDF 파싱 오류: ${err.message?.slice(0, 80) ?? 'unknown'}]` },
      };
    }

    const pages = fullText.split('\f').filter((p) => p.trim());
    const blocks = pages.flatMap((pageText, pageIdx): ParseResult['blocks'] => {
      const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean);
      return lines.map((line) => {
        const h = detectHeading(line);
        return h
          ? { kind: 'heading' as const, level: h.level, text: line, page: pageIdx + 1 }
          : { kind: 'paragraph' as const, text: line, page: pageIdx + 1 };
      });
    });

    return { text: fullText, blocks, pageCount, meta: {} };
  },
};

registerParser(pdfParser);
export default pdfParser;
