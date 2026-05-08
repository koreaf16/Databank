/**
 * 파일: frontend/src/shared/api/apiClient.ts
 * 역할: 백엔드 API 호출 기본 레이어.
 */

import { ApiError } from './errors.js';

const API_BASE =
  typeof window !== 'undefined' && (window as any).DATABANK_API_BASE
    ? (window as any).DATABANK_API_BASE
    : '';

export function toApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

const TOKEN_KEY = 'db_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** GET 요청 */
export async function apiGet(path: string, query?: Record<string, string>): Promise<any> {
  const url = query ? `${toApiUrl(path)}?${new URLSearchParams(query)}` : toApiUrl(path);
  try {
    const response = await fetch(url, { method: 'GET', headers: authHeaders() });
    return await parseApiResponse(response);
  } catch (err) {
    handleNetworkError(err);
    throw err;
  }
}

/** POST 요청 */
export async function apiPost(path: string, body?: any): Promise<any> {
  try {
    const response = await fetch(toApiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body ?? {}),
    });
    return await parseApiResponse(response);
  } catch (err) {
    handleNetworkError(err);
    throw err;
  }
}

/** PATCH 요청 */
export async function apiPatch(path: string, body?: any): Promise<any> {
  try {
    const response = await fetch(toApiUrl(path), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body ?? {}),
    });
    return await parseApiResponse(response);
  } catch (err) {
    handleNetworkError(err);
    throw err;
  }
}

/** PUT 요청 */
export async function apiPut(path: string, body?: any): Promise<any> {
  try {
    const response = await fetch(toApiUrl(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body ?? {}),
    });
    return await parseApiResponse(response);
  } catch (err) {
    handleNetworkError(err);
    throw err;
  }
}

/** DELETE 요청 */
export async function apiDelete(path: string): Promise<any> {
  try {
    const response = await fetch(toApiUrl(path), { method: 'DELETE', headers: authHeaders() });
    return await parseApiResponse(response);
  } catch (err) {
    handleNetworkError(err);
    throw err;
  }
}

export function handleNetworkError(err: any) {
  if (typeof window !== 'undefined' && (err instanceof TypeError || err.name === 'AbortError' || !window.navigator.onLine)) {
    window.dispatchEvent(new CustomEvent('db-server-down'));
  }
}

export async function parseApiResponse(response: Response): Promise<any> {
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    // 401 Unauthorized 처리: 세션 만료 시 로그인 화면으로 유도하기 위해 이벤트 발생
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('db-unauthorized'));
    }

    if (body?.ok === false && body?.error) {
      const { code, message, detail } = body.error;
      throw new ApiError(message || '요청에 실패했습니다', response.status, code, detail);
    }
    const message = body?.error || body?.message || response.statusText || '요청에 실패했습니다';
    throw new ApiError(message, response.status, 'INTERNAL', body?.detail);
  }

  if (body !== null && typeof body === 'object' && 'ok' in body && body.ok === true) {
    return body.data;
  }

  return body;
}
