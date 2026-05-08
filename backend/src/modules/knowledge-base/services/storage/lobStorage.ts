/**
 * 파일: backend/src/modules/knowledge-base/services/storage/lobStorage.ts
 * 역할: Oracle SecureFiles LOB BLOB 저장·읽기·삭제.
 *       KB_DOCUMENT_FILES.CONTENT_BLOB에 파일 원본을 저장하고,
 *       다운로드 시 Buffer로 읽어 반환한다.
 *
 * 연관 파일:
 *   - repository/kbFileRepository.ts  : FILE_ID 생성 후 lobStorage 호출
 *   - routes/kbUploadRoutes.ts        : 멀티파트 업로드 → writeBlob
 *
 * 비고: oracledb BLOB 스트리밍은 버퍼 방식(Buffer)으로 처리.
 *       100MB 한도는 라우트에서 multer로 제한하므로 여기서는 신뢰.
 */

import oracledb from 'oracledb';

/**
 * BLOB 컬럼에 Buffer를 기록한다.
 * INSERT 후 RETURNING INTO로 LOB 로케이터를 받아 write.
 */
export async function writeBlob(
  connection: any,
  fileId: string,
  buffer: Buffer,
): Promise<void> {
  // LOB 바인드 방식: INSERT 시 직접 버퍼 바인딩 (oracledb v6 방식)
  await connection.execute(
    `UPDATE KB_DOCUMENT_FILES SET CONTENT_BLOB = :blob WHERE FILE_ID = :fid`,
    {
      blob: { val: buffer, type: oracledb.BLOB },
      fid: fileId,
    },
    { autoCommit: false },
  );
}

/**
 * BLOB 컬럼에서 Buffer를 읽어 반환한다.
 * 파일을 찾지 못하면 null 반환.
 */
export async function readBlob(
  connection: any,
  fileId: string,
): Promise<Buffer | null> {
  const result = await connection.execute(
    `SELECT CONTENT_BLOB FROM KB_DOCUMENT_FILES WHERE FILE_ID = :fid`,
    { fid: fileId },
    { fetchInfo: { CONTENT_BLOB: { type: oracledb.BUFFER } } },
  );
  const row = result.rows?.[0];
  if (!row) return null;
  // outFormat 설정에 따라 배열 또는 객체로 반환될 수 있음
  const val = Array.isArray(row) ? row[0] : row['CONTENT_BLOB'];
  if (!val) return null;
  return Buffer.isBuffer(val) ? val : Buffer.from(val);
}
