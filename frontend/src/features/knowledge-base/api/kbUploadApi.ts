/**
 * 파일: frontend/src/features/knowledge-base/api/kbUploadApi.ts
 * 역할: 파일 업로드(단일/다중), URL 스캔/등록, 인덱싱 진행률 SSE 구독 API.
 */

import { toApiUrl, getAuthToken, parseApiResponse, handleNetworkError } from '../../../shared/api/apiClient.js';

function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 단일 파일 업로드. { docId, jobId } 반환 */
export async function uploadFile(file, categoryId) {
  const form = new FormData();
  form.append('file', file);
  if (categoryId) form.append('categoryId', categoryId);
  try {
    const res = await fetch(toApiUrl('/api/kb/upload'), { method: 'POST', headers: authHeaders(), body: form });
    return await parseApiResponse(res);
  } catch (err) {
    handleNetworkError(err);
    throw err;
  }
}

/**
 * 다중 파일 업로드 (XHR — 업로드 진행률 onProgress 콜백 지원).
 * categoryId만 제공하면 백엔드가 파일마다 문서를 자동 생성.
 * { count, files, jobIds } 반환
 */
export function uploadFiles(
  files: File[],
  categoryId?: string,
  tags?: string,
  docType?: string,
  productId?: string,
  productName?: string,
  versions?: string[],
  onProgress?: (pct: number) => void,
  vendor?: string,
  osPlatform?: string,
  versionRange?: string,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    if (categoryId)   form.append('categoryId', categoryId);
    if (tags)         form.append('tags', tags);
    if (docType)      form.append('docType', docType);
    if (productId)    form.append('productId', productId);
    if (productName)  form.append('productName', productName);
    if (versions?.length) form.append('versions', versions.join(','));
    if (vendor)       form.append('vendor', vendor);
    if (osPlatform)   form.append('osPlatform', osPlatform);
    if (versionRange) form.append('versionRange', versionRange);

    const xhr = new XMLHttpRequest();
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.addEventListener('load', () => {
      // 401 Unauthorized 처리
      if (xhr.status === 401 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('db-unauthorized'));
      }
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && body.ok) resolve(body.data);
        else reject(new Error(body?.error?.message ?? '업로드 실패'));
      } catch { reject(new Error('응답 파싱 실패')); }
    });
    xhr.addEventListener('error', (err) => {
      handleNetworkError(err);
      reject(new Error('네트워크 오류'));
    });
    xhr.addEventListener('abort', () => reject(new Error('업로드 취소됨')));

    const token = getAuthToken();
    xhr.open('POST', toApiUrl('/api/kb/upload/multi'));
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(form);
  });
}

/**
 * URL HTML에서 PDF/DOCX 링크 목록 추출.
 * [{ href, name, ext }] 반환
 */
export async function probeUrl(url) {
  try {
    const res = await fetch(
      toApiUrl(`/api/kb/probe-url?url=${encodeURIComponent(url)}`),
      { headers: authHeaders() },
    );
    return await parseApiResponse(res);
  } catch (err) {
    handleNetworkError(err);
    throw err;
  }
}

/**
 * URL 목록을 다운로드해 문서 자동 생성 + 인덱싱 큐 등록.
 * { count, results, jobIds } 반환
 */
export async function registerUrls(urls, categoryId, tags?, docType?, productId?, productName?, versions?, vendor?, osPlatform?, versionRange?) {
  try {
    const res = await fetch(toApiUrl('/api/kb/register-urls'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ urls, categoryId, tags, docType, productId, productName, versions, vendor, osPlatform, versionRange }),
    });
    return await parseApiResponse(res);
  } catch (err) {
    handleNetworkError(err);
    throw err;
  }
}

/**
 * SSE 진행률 구독.
 * onUpdate(jobs[]) 콜백으로 잡 상태 배열 전달.
 * 반환된 함수를 호출하면 구독 종료.
 */
export function subscribeJobProgress(jobIds, onUpdate, onDone) {
  const ids = jobIds.join(',');
  const url = toApiUrl(`/api/kb/events/jobs?ids=${encodeURIComponent(ids)}`);
  const es = new EventSource(url);

  es.addEventListener('message', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.jobs) onUpdate(data.jobs);
    } catch { /* 파싱 실패 무시 */ }
  });

  es.addEventListener('close', () => { es.close(); onDone?.(); });
  es.onerror = () => { es.close(); onDone?.(); };

  return () => es.close();
}

/** 파일 다운로드 URL 반환 */
export function getFileDownloadUrl(fileId) {
  return toApiUrl(`/api/kb/files/${fileId}/download`);
}

/** 최근 잡 목록 조회 (DB 영구 로드, 문서 제목 포함) */
export async function listRecentJobs() {
  const res = await fetch(toApiUrl('/api/kb/jobs'), { headers: authHeaders() });
  return parseApiResponse(res);
}

/** 잡 취소 (queued/running 상태만 가능) */
export async function cancelJob(jobId: string): Promise<void> {
  const res = await fetch(toApiUrl(`/api/kb/jobs/${jobId}/cancel`), {
    method: 'POST',
    headers: authHeaders(),
  });
  await parseApiResponse(res);
}

/** 잡 삭제 (done/failed/cancelled 상태만 가능) */
export async function deleteJob(jobId: string): Promise<void> {
  const res = await fetch(toApiUrl(`/api/kb/jobs/${jobId}`), {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await parseApiResponse(res);
}

/** 완료된 모든 잡 일괄 삭제 (done/failed/cancelled) */
export async function deleteCompletedJobs(): Promise<{ deletedCount: number }> {
  const res = await fetch(toApiUrl('/api/kb/jobs/bulk-completed'), {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return parseApiResponse(res);
}
