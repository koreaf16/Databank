/**
 * 파일: backend/src/modules/knowledge-base/repository/kbFileRepository.ts
 * 역할: KB_DOCUMENT_FILES 테이블 CRUD.
 *       파일 메타 insert/조회/삭제. BLOB 바이너리는 lobStorage.ts 담당.
 *
 * 연관 파일:
 *   - schema/kbChunkSchema.ts              : KB_DOCUMENT_FILES DDL
 *   - services/storage/lobStorage.ts       : BLOB R/W
 *   - routes/kbUploadRoutes.ts             : 업로드 라우트
 *
 * 비고: FILE_ID는 'kb-file-XXXXX' 형태로 애플리케이션에서 생성.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { nullableText, notFoundError, clobFetchHandler, loadSql } from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

export interface KbFileRecord {
  id: string;
  docId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  pageCount: number | null;
  extractedAt: string | null;
  parserName: string | null;
  previewText: string | null;
  createdAt: string;
}

function generateFileId(): string {
  return `kb-file-${Date.now().toString(36).toUpperCase()}`;
}

function normalizeFile(row: any): KbFileRecord {
  return {
    id:          row['id'],
    docId:       row['docId'],
    fileName:    row['fileName'],
    mimeType:    row['mimeType'] ?? null,
    sizeBytes:   row['sizeBytes'] != null ? Number(row['sizeBytes']) : null,
    sha256:      row['sha256'] ?? null,
    pageCount:   row['pageCount'] != null ? Number(row['pageCount']) : null,
    extractedAt: row['extractedAt'] ?? null,
    parserName:  row['parserName'] ?? null,
    previewText: row['previewText'] ?? null,
    createdAt:   row['createdAt'],
  };
}

/** 파일 메타 행을 insert한다. BLOB은 NULL로 시작, writeBlob으로 별도 기록. */
export async function insertFile(
  connection: any,
  payload: {
    docId: string;
    fileName: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    sha256?: string | null;
  },
): Promise<string> {
  const fileId = generateFileId();
  await connection.execute(sql('insertFile.sql'), {
    fid:   fileId,
    did:   payload.docId,
    fname: payload.fileName,
    mime:  nullableText(payload.mimeType),
    sz:    payload.sizeBytes ?? null,
    sha:   nullableText(payload.sha256),
  }, { autoCommit: false });
  return fileId;
}

/** 파서 완료 시 page_count, extracted_at, parser_name, preview_text 갱신 */
export async function markExtracted(
  connection: any,
  fileId: string,
  pageCount: number | null,
  parserName: string,
  previewText?: string | null,
): Promise<void> {
  await connection.execute(sql('markFileExtracted.sql'), {
    pc:    pageCount ?? null,
    pname: parserName,
    prev:  nullableText(previewText),
    fid:   fileId,
  }, { autoCommit: false });
}

/** 파일명 + SHA256 해시가 모두 일치하는 기존 파일 조회. 없으면 null 반환. */
export async function findFileByNameAndSha256(
  connection: any,
  fileName: string,
  sha256: string,
): Promise<KbFileRecord | null> {
  const oracledb = (await import('oracledb')).default;
  const fullSql = `${sql('selectFile.sql')} WHERE FILE_NAME = :fname AND SHA256 = :sha AND ROWNUM = 1`;
  const result = await connection.execute(fullSql, { fname: fileName, sha: sha256 }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });
  const row = result.rows?.[0];
  return row ? normalizeFile(row) : null;
}

/** FILE_ID로 메타 조회 (BLOB 제외) */
export async function findFileById(
  connection: any,
  fileId: string,
): Promise<KbFileRecord> {
  const oracledb = (await import('oracledb')).default;
  const fullSql = `${sql('selectFile.sql')} WHERE FILE_ID = :fid`;
  const result = await connection.execute(fullSql, { fid: fileId }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });
  const row = result.rows?.[0];
  if (!row) throw notFoundError(`파일을 찾을 수 없습니다 (${fileId})`);
  return normalizeFile(row);
}

/** DOC_ID에 연결된 파일 목록 */
export async function listFilesByDoc(
  connection: any,
  docId: string,
): Promise<KbFileRecord[]> {
  const oracledb = (await import('oracledb')).default;
  const fullSql = `${sql('selectFile.sql')} WHERE DOC_ID = :did ORDER BY CREATED_AT`;
  const result = await connection.execute(fullSql, { did: docId }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });
  return (result.rows ?? []).map(normalizeFile);
}
