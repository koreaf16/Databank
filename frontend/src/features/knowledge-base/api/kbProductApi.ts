/**
 * 파일: frontend/src/features/knowledge-base/api/kbProductApi.ts
 * 역할: 제품 카탈로그 API 호출 — 검색, 버전 조회, 신규 등록.
 */

import { toApiUrl, getAuthToken, parseApiResponse } from '../../../shared/api/apiClient.js';

function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface KbProduct {
  id: string;
  canonical: string;
  displayName: string | null;
  vendor: string | null;
  category: string;
}

export interface KbProductVersion {
  id: string;
  productId: string;
  tag: string;
  num: number;
  eolDate: string | null;
}

/** 제품 검색 (q 생략 시 전체) */
export async function getProducts(q?: string): Promise<KbProduct[]> {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  const res = await fetch(toApiUrl(`/api/kb/products${qs}`), { headers: authHeaders() });
  return parseApiResponse(res);
}

/** 제품의 버전 목록 */
export async function getProductVersions(productId: string): Promise<KbProductVersion[]> {
  const res = await fetch(toApiUrl(`/api/kb/products/${productId}/versions`), { headers: authHeaders() });
  return parseApiResponse(res);
}

/** 새 제품 등록 */
export async function createProduct(data: { canonical: string; vendor?: string; category?: string }): Promise<KbProduct> {
  const res = await fetch(toApiUrl('/api/kb/products'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  return parseApiResponse(res);
}
