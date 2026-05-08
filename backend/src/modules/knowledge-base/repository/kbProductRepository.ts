/**
 * 파일: backend/src/modules/knowledge-base/repository/kbProductRepository.ts
 * 역할: KB_PRODUCTS + KB_PRODUCT_VERSIONS CRUD.
 *       searchProducts — 이름/벤더 LIKE 검색
 *       getProductById, listVersionsByProduct, createProduct, createVersion
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validationError, notFoundError, loadSql } from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

// ── 내부 타입 ─────────────────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  canonical: string;
  displayName: string | null;
  vendor: string | null;
  category: string;
  activeFlag: number;
}

interface VersionRow {
  id: string;
  productId: string;
  tag: string;
  num: number;
  eolDate: string | null;
  activeFlag: number;
}

// ── 제품 검색 ─────────────────────────────────────────────────────────────────

export async function searchProducts(conn, q?: string): Promise<ProductRow[]> {
  let querySql = `${sql('selectProduct.sql')} WHERE ACTIVE_FLAG = 1`;
  const binds: Record<string, unknown> = {};
  if (q?.trim()) {
    querySql += ` AND (UPPER(CANONICAL) LIKE UPPER(:q) OR UPPER(VENDOR) LIKE UPPER(:q))`;
    binds.q = `%${q.trim()}%`;
  }
  querySql += ` ORDER BY CANONICAL`;
  const result = await conn.execute(querySql, binds, { outFormat: 4002 });
  return result.rows as ProductRow[];
}

// ── 제품 단건 조회 ────────────────────────────────────────────────────────────

export async function getProductById(conn, id: string): Promise<ProductRow> {
  const querySql = `${sql('selectProduct.sql')} WHERE PRODUCT_ID = :id`;
  const result = await conn.execute(querySql, { id }, { outFormat: 4002 });
  const row = (result.rows as ProductRow[])[0];
  if (!row) throw notFoundError(`제품을 찾을 수 없습니다: ${id}`);
  return row;
}

// ── 버전 목록 (제품별) ────────────────────────────────────────────────────────

export async function listVersionsByProduct(conn, productId: string): Promise<VersionRow[]> {
  const result = await conn.execute(sql('selectVersionsByProduct.sql'), { pid: productId }, { outFormat: 4002 });
  return result.rows as VersionRow[];
}

// ── 제품 생성 ─────────────────────────────────────────────────────────────────

export async function createProduct(conn, data: {
  canonical: string; vendor?: string; category?: string; displayName?: string;
}): Promise<ProductRow> {
  if (!data.canonical?.trim()) throw validationError('canonical 파라미터가 필요합니다');
  const id = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await conn.execute(sql('insertProduct.sql'), {
    id,
    canonical: data.canonical.trim(),
    display: data.displayName?.trim() || data.canonical.trim(),
    vendor: data.vendor?.trim() || null,
    category: data.category?.trim() || 'other',
  });
  return getProductById(conn, id);
}

// ── 버전 생성 ─────────────────────────────────────────────────────────────────

export async function createVersion(conn, productId: string, data: {
  tag: string; num: number; eolDate?: string;
}): Promise<VersionRow> {
  if (!data.tag?.trim()) throw validationError('tag 파라미터가 필요합니다');
  if (!data.num) throw validationError('num 파라미터가 필요합니다');
  const id = `ver-${productId}-${data.tag.replace(/[^a-z0-9]/gi, '')}`;
  await conn.execute(sql('insertProductVersion.sql'), { id, pid: productId, tag: data.tag.trim(), num: data.num, eol: data.eolDate || null });
  const result = await conn.execute(sql('selectProductVersionById.sql'), { id }, { outFormat: 4002 });
  return (result.rows as VersionRow[])[0];
}
