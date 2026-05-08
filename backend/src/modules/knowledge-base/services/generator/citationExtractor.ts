/**
 * 파일: backend/src/modules/knowledge-base/services/generator/citationExtractor.ts
 * 역할: LLM 응답 본문에서 [1], [2] 패턴을 추출해 청크 ID와 매핑한다.
 *
 * 연관 파일:
 *   - services/retriever/hybridFusion  : FusedChunk (chunkId 소스)
 *   - routes/kbSearchRoutes.ts         : /ask 엔드포인트에서 호출
 */

export interface CitationRef {
  num: number;
  chunkId: string;
  docId: string;
  headingPath: string | null;
  pageFrom: number | null;
}

/**
 * 응답 텍스트에서 [N] 패턴을 추출하고 chunks 배열 인덱스(1-based)로 매핑.
 * chunks[0] → [1], chunks[1] → [2], ...
 */
export function extractCitations(
  responseText: string,
  chunks: Array<{ id: string; docId: string; headingPath: string | null; pageFrom: number | null }>,
): CitationRef[] {
  const found = new Set<number>();

  for (const match of responseText.matchAll(/\[(\d+)\]/g)) {
    const n = parseInt(match[1], 10);
    if (n >= 1 && n <= chunks.length) found.add(n);
  }

  return Array.from(found)
    .sort((a, b) => a - b)
    .map((n) => {
      const c = chunks[n - 1];
      return {
        num:         n,
        chunkId:     c.id,
        docId:       c.docId,
        headingPath: c.headingPath,
        pageFrom:    c.pageFrom,
      };
    });
}
