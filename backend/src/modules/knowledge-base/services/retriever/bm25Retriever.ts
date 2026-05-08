/**
 * 파일: backend/src/modules/knowledge-base/services/retriever/bm25Retriever.ts
 * 역할: Oracle Text CONTAINS 함수를 이용한 BM25 전문검색.
 *       특수문자 이스케이프 후 SCORE(1) DESC 정렬로 Top-K 청크 반환.
 *
 * 연관 파일:
 *   - repository/kbChunkRepository.ts  : ChunkRecord 타입
 *   - services/retriever/hybridFusion  : RRF 융합 입력
 *   - schema/kbChunkSchema.ts          : IDX_KBC_TEXT 인덱스
 */

import { clobFetchHandler } from '../../../../infra/oracle/helpers.js';

export interface ScoredChunk {
  id: string;
  docId: string;
  fileId: string | null;
  ordinal: number;
  headingPath: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  tokenCount: number | null;
  contentText: string;
  contextPrefix: string | null;
  score: number;
}

/**
 * Oracle Text CONTAINS 쿼리용 특수문자 이스케이프.
 * {, }, (, ), ;, !, ,, &, |, -, ~, $, %, ^ 등 Oracle Text 연산자를 {}로 감싼다.
 */
function escapeOracleText(query: string): string {
  return query.replace(/[{}()|!,&;~$%^*?\-\\]/g, (ch) => `{${ch}}`);
}

const MAX_TEXT_TERMS = 8;

function extractTextTerms(query: string): string[] {
  const terms = query.match(/[A-Za-z0-9_#]+/g) ?? [];
  const unique = new Set<string>();
  for (const raw of terms) {
    const term = raw.trim();
    if (!term || (term.length < 2 && !/\d/.test(term))) continue;
    unique.add(term);
    if (unique.size >= MAX_TEXT_TERMS) break;
  }
  return Array.from(unique);
}

function buildOracleTextQueries(query: string): string[] {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  const expandedQueries: string[] = [];
  if (
    lower.includes('standby') &&
    lower.includes('redo') &&
    lower.includes('log') &&
    (
      lower.includes('create') ||
      lower.includes('add') ||
      trimmed.includes('생성') ||
      trimmed.includes('추가') ||
      trimmed.includes('방법')
    )
  ) {
    expandedQueries.push('{standby} AND {redo} AND {log} AND {add} AND {logfile}');
    expandedQueries.push('{standby} AND {redo} AND {logfile}');
  }

  const terms = extractTextTerms(trimmed).map((term) => `{${term}}`);
  if (terms.length >= 2) {
    return [
      ...expandedQueries,
      terms.join(' AND '),
      terms.join(' ACCUM '),
    ];
  }
  if (terms.length === 1) return [...expandedQueries, ...terms];
  const escaped = escapeOracleText(trimmed);
  return escaped ? [...expandedQueries, escaped] : expandedQueries;
}

function mapRows(rows: any[] = []): ScoredChunk[] {
  return rows.map((row: any) => ({
    id:            row['id'],
    docId:         row['docId'],
    fileId:        row['fileId'] ?? null,
    ordinal:       Number(row['ordinal']),
    headingPath:   row['headingPath'] ?? null,
    pageFrom:      row['pageFrom'] != null ? Number(row['pageFrom']) : null,
    pageTo:        row['pageTo'] != null ? Number(row['pageTo']) : null,
    tokenCount:    row['tokenCount'] != null ? Number(row['tokenCount']) : null,
    contentText:   row['contentText'] ?? '',
    contextPrefix: row['contextPrefix'] ?? null,
    score:         Number(row['score']),
  }));
}

/**
 * BM25 전문검색. Oracle Text CONTAINS + SCORE(1) 정렬.
 * CTX 인덱스(IDX_KBC_TEXT)가 없거나 오류 시 빈 배열 반환.
 */
export async function bm25Search(
  connection: any,
  query: string,
  topK: number = 50,
): Promise<ScoredChunk[]> {
  const oracledb = (await import('oracledb')).default;
  const textQueries = buildOracleTextQueries(query);
  if (textQueries.length === 0) return [];

  for (const textQuery of textQueries) {
    try {
      const result = await connection.execute(
        `SELECT CHUNK_ID AS "id", DOC_ID AS "docId", FILE_ID AS "fileId",
                ORDINAL AS "ordinal", HEADING_PATH AS "headingPath",
                PAGE_FROM AS "pageFrom", PAGE_TO AS "pageTo",
                TOKEN_COUNT AS "tokenCount", CONTENT_TEXT AS "contentText",
                CONTEXT_PREFIX AS "contextPrefix",
                SCORE(1) AS "score"
         FROM KB_DOCUMENT_CHUNKS
         WHERE CONTAINS(CONTENT_TEXT, :q, 1) > 0
         ORDER BY SCORE(1) DESC
         FETCH FIRST :topk ROWS ONLY`,
        { q: textQuery, topk: topK },
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          fetchTypeHandler: clobFetchHandler,
        },
      );

      const rows = mapRows(result.rows ?? []);
      if (rows.length > 0) return rows;
    } catch {
      // Try the fallback expression below; if all fail, vector search still serves results.
    }
  }

  return [];
}
