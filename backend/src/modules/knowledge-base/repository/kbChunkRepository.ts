/**
 * 파일: backend/src/modules/knowledge-base/repository/kbChunkRepository.ts
 * 역할: KB_DOCUMENT_CHUNKS 테이블 insert·조회·삭제·벡터 검색.
 *       BM25 검색은 retriever/bm25Retriever.ts에서 담당.
 *
 * 연관 파일:
 *   - schema/kbChunkSchema.ts             : KB_DOCUMENT_CHUNKS DDL
 *   - services/chunker/structuralChunker  : 청크 생성 후 insertChunks 호출
 *   - services/retriever/vectorRetriever  : VECTOR_DISTANCE 쿼리
 *
 * 비고: EMBEDDING은 Float32Array를 JSON 배열 문자열로 변환 후 바인딩.
 *       Oracle 26ai가 VECTOR_DISTANCE 함수를 지원한다.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { clobFetchHandler, loadSql } from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

export interface ChunkRecord {
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
  embeddingModel: string | null;
  lang: string;
}

let _chunkSeq = 0;
function generateChunkId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const seq = (++_chunkSeq).toString(36).padStart(4, '0').toUpperCase();
  return `kb-chk-${ts}-${seq}`;
}

function normalizeChunk(row: any): ChunkRecord {
  return {
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
    embeddingModel: row['embeddingModel'] ?? null,
    lang:          row['lang'] ?? 'ko',
  };
}

/** 청크 배치 insert. embedding이 있으면 함께 저장한다. */
export async function insertChunks(
  connection: any,
  chunks: Array<{
    docId: string;
    fileId?: string | null;
    ordinal: number;
    headingPath?: string | null;
    pageFrom?: number | null;
    pageTo?: number | null;
    tokenCount?: number | null;
    contentText: string;
    embedding?: number[] | null;
    embeddingModel?: string | null;
    lang?: string;
  }>,
): Promise<string[]> {
  const ids: string[] = [];
  const binds = chunks.map((c) => {
    const chunkId = generateChunkId();
    ids.push(chunkId);
    return {
      cid:    chunkId,
      did:    c.docId,
      fid:    c.fileId ?? null,
      ord:    c.ordinal,
      hp:     c.headingPath ?? null,
      pf:     c.pageFrom ?? null,
      pt:     c.pageTo ?? null,
      tc:     c.tokenCount ?? null,
      ct:     c.contentText,
      emb:    c.embedding ? JSON.stringify(c.embedding) : null,
      emodel: c.embeddingModel ?? null,
      lang:   c.lang ?? 'ko',
    };
  });

  if (binds.length > 0) {
    await connection.executeMany(sql('insertChunk.sql'), binds, { autoCommit: false });
  }
  return ids;
}

/** DOC_ID의 청크 목록 조회 */
export async function listChunksByDoc(
  connection: any,
  docId: string,
): Promise<ChunkRecord[]> {
  const oracledb = (await import('oracledb')).default;
  const fullSql = `${sql('selectChunks.sql')} WHERE DOC_ID = :did ORDER BY ORDINAL`;
  const result = await connection.execute(fullSql, { did: docId }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });
  return (result.rows ?? []).map(normalizeChunk);
}

/** DOC_ID의 청크 전체 삭제 (재인덱싱 시) */
export async function deleteChunksByDoc(
  connection: any,
  docId: string,
): Promise<void> {
  await connection.execute(sql('deleteChunksByDoc.sql'), { did: docId }, { autoCommit: false });
}

/** 임베딩 업데이트 */
export async function updateEmbedding(
  connection: any,
  chunkId: string,
  embedding: number[],
  modelName: string,
): Promise<void> {
  await connection.execute(sql('updateChunkEmbedding.sql'), {
    emb:    JSON.stringify(embedding),
    emodel: modelName,
    cid:    chunkId,
  }, { autoCommit: false });
}

/** 코사인 벡터 검색 (Top-K) */
export async function vectorSearch(
  connection: any,
  queryEmbedding: number[],
  topK: number = 50,
): Promise<Array<ChunkRecord & { score: number }>> {
  const oracledb = (await import('oracledb')).default;
  const result = await connection.execute(sql('vectorSearchChunks.sql'), {
    qvec: JSON.stringify(queryEmbedding),
    topk: topK,
  }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });
  return (result.rows ?? []).map((row: any) => ({
    ...normalizeChunk(row),
    score: Number(row['score']),
  }));
}

/** DOC_ID별 청크 개수 집계 */
export async function countChunksByDoc(
  connection: any,
  docId: string,
): Promise<number> {
  const oracledb = (await import('oracledb')).default;
  const result = await connection.execute(sql('countChunksByDoc.sql'), { did: docId }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });
  return Number(result.rows?.[0]?.['cnt'] ?? 0);
}

/** Oracle Text 인덱스 수동 동기화 — 트랜잭션 커밋 후 호출해야 한다 */
export async function syncTextIndex(connection: any): Promise<void> {
  await connection.execute(`BEGIN CTX_DDL.SYNC_INDEX('IDX_KBC_TEXT'); END;`);
}

/** DOC_ID별 임베딩된 청크 개수 집계 */
export async function countEmbeddedChunksByDoc(
  connection: any,
  docId: string,
): Promise<number> {
  const oracledb = (await import('oracledb')).default;
  const result = await connection.execute(sql('countEmbeddedChunksByDoc.sql'), { did: docId }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });
  return Number(result.rows?.[0]?.['cnt'] ?? 0);
}
