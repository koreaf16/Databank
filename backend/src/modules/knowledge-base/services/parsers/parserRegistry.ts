/**
 * 파일: backend/src/modules/knowledge-base/services/parsers/parserRegistry.ts
 * 역할: MIME 타입을 파서로 매핑하는 레지스트리.
 *       ParseResult 인터페이스 정의 + mime → parser 디스패치.
 *
 * 연관 파일:
 *   - services/parsers/pdfParser.ts
 *   - services/parsers/docxParser.ts
 *   - services/parsers/xlsxParser.ts
 *   - services/parsers/textParser.ts
 *   - services/jobs/jobHandlers.ts : parse 잡에서 호출
 */

export interface ParseBlock {
  kind: 'heading' | 'paragraph' | 'table' | 'list' | 'code' | 'image_caption';
  level?: number;
  text: string;
  page?: number;
}

export interface ParseResult {
  text: string;
  blocks: ParseBlock[];
  pageCount?: number;
  meta: {
    author?: string;
    createdAt?: string;
    title?: string;
  };
}

export interface DocumentParser {
  mimeTypes: string[];
  parse(buffer: Buffer, filename: string): Promise<ParseResult>;
}

// registry는 모듈 로드 시 채워진다
const registry = new Map<string, DocumentParser>();

export function registerParser(parser: DocumentParser): void {
  for (const mime of parser.mimeTypes) {
    registry.set(mime, parser);
  }
}

/** MIME에 맞는 파서를 반환. 없으면 null. */
export function getParser(mimeType: string): DocumentParser | null {
  // 정확한 매치 먼저
  const exact = registry.get(mimeType);
  if (exact) return exact;
  // text/* 계열 폴백
  if (mimeType.startsWith('text/')) {
    return registry.get('text/plain') ?? null;
  }
  return null;
}

