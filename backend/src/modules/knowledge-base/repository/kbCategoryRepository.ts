/**
 * 파일: backend/src/modules/knowledge-base/repository/kbCategoryRepository.js
 * 역할: KB_CATEGORIES 테이블 CRUD. 자기참조 트리(PARENT_ID) 구조.
 *       CATEGORY_ID는 애플리케이션에서 'kb-cat-XXXXX' 형태로 생성.
 *
 * 연관 파일:
 *   - schema/kbSchema.js                    : 테이블 DDL
 *   - routes/kbRoutes.js                    : HTTP 라우트
 *   - repository/kbDocumentRepository.js    : 카테고리 삭제 전 문서 존재 확인에 사용
 *   - infra/oracle/helpers.js               : requiredText, notFoundError 등
 *
 * 비고: commit은 라우트(withOracleTransaction) 책임.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  requiredText,
  nullableText,
  toNullableInt,
  notFoundError,
  validationError,
  loadSql,
} from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

function generateCategoryId() {
  return `kb-cat-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

export async function listCategories(connection: any) {
  const result = await connection.execute(
    `${sql('selectCategory.sql')} WHERE ENABLED = 1 ORDER BY SORT_ORDER, NAME`,
  );
  return result.rows || [];
}

export async function findCategoryById(connection: any, categoryId: any): Promise<any | null> {
  const fullSql = `${sql('selectCategory.sql')} WHERE CATEGORY_ID = :cid AND ENABLED = 1`;
  const result = await connection.execute(fullSql, { cid: categoryId });
  return result.rows?.[0] || null;
}

export async function createCategory(connection: any, payload: any = {}) {
  const name     = requiredText(payload.name, '카테고리명');
  const parentId = nullableText(payload.parentId);
  const icon     = nullableText(payload.icon) || 'book';
  const order    = toNullableInt(payload.order) ?? 0;
  const catId    = payload.id && String(payload.id).startsWith('kb-') ? String(payload.id) : generateCategoryId();

  await connection.execute(sql('insertCategory.sql'), { cid: catId, parent_id: parentId, name, icon, order_val: order });
  return findCategoryById(connection, catId);
}

export async function updateCategory(connection: any, categoryId: any, payload: any = {}) {
  const current = await findCategoryById(connection, categoryId);
  if (!current) throw notFoundError('카테고리를 찾을 수 없습니다');

  const name  = nullableText(payload.name)  ?? current.name;
  const icon  = nullableText(payload.icon)  ?? current.icon;
  const order = payload.order != null ? (toNullableInt(payload.order) ?? current.order) : current.order;

  await connection.execute(sql('updateCategory.sql'), { cid: categoryId, name, icon, order_val: order });
  return findCategoryById(connection, categoryId);
}

export async function deleteCategory(connection: any, categoryId: any) {
  const current = await findCategoryById(connection, categoryId);
  if (!current) throw notFoundError('카테고리를 찾을 수 없습니다');

  const docCheck = await connection.execute(sql('countDocsInCategoryTree.sql'), { cid: categoryId });
  const count = docCheck.rows?.[0]?.cnt || 0;
  if (count > 0) throw validationError('문서가 있는 카테고리는 삭제할 수 없습니다. 먼저 문서를 이동하세요.');

  await connection.execute(sql('deleteCategory.sql'), { cid: categoryId });
  return { id: categoryId, deleted: true };
}
