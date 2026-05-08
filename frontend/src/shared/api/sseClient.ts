/**
 * 파일: frontend/src/shared/api/sseClient.ts
 * 역할: POST + ReadableStream SSE 공용 helper.
 *       브라우저 EventSource는 GET-only이므로 fetch + ReadableStream 패턴을 사용한다.
 *       event: / data: 형식의 SSE 이벤트를 파싱해 onEvent 콜백으로 전달.
 *       네트워크·파싱 오류는 onError로 반드시 전달 — silent failure 금지.
 *
 * 연관 파일:
 *   - shared/api/apiClient.ts                         : toApiUrl, getAuthToken, handleNetworkError
 *   - features/knowledge-base/api/kbSearchApi.ts      : askStream (이 helper 사용)
 *   - features/messaging/parts/AIPanel.tsx            : postSseStream 직접 사용
 */

import { toApiUrl, getAuthToken, handleNetworkError } from './apiClient.js';

export interface SseCallbacks {
  onEvent: (event: string, data: any) => void;
  onError: (message: string) => void;
}

/**
 * POST body를 전송하고 SSE 스트림을 수신한다.
 * 반환값: abort 함수 — 호출 시 스트림 연결 종료.
 */
export function postSseStream(
  path: string,
  body: unknown,
  callbacks: SseCallbacks,
): () => void {
  const { onEvent, onError } = callbacks;
  const token = getAuthToken();
  const url   = toApiUrl(path);
  const ctrl  = new AbortController();

  (async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        if (res.status === 401 && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('db-unauthorized'));
        }
        const err = await res.json().catch(() => ({}));
        onError(err?.error?.message ?? `요청 실패 (${res.status})`);
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf           = '';
      let receivedDone  = false;
      let receivedError = false;
      let receivedEvent = false;

      function handlePart(part: string) {
        const lines = part.trim().split('\n');
        let event = 'message';
        let data  = '';
        for (const line of lines) {
          if (line.startsWith('event: '))      event = line.slice(7).trim();
          else if (line.startsWith('data: '))  data += line.slice(6).trim();
        }
        if (!data) return;
        try {
          const parsed = JSON.parse(data);
          receivedEvent = true;
          if (event === 'done')  receivedDone  = true;
          if (event === 'error') receivedError = true;
          onEvent(event, parsed);
        } catch { /* 불완전한 JSON 라인 무시 */ }
      }

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) handlePart(part);
      }
      if (buf.trim()) handlePart(buf);

      if (!receivedDone && !receivedError && !ctrl.signal.aborted) {
        onError(
          receivedEvent
            ? 'AI 응답 스트림이 완료되지 않았습니다.'
            : 'AI 응답 스트림이 비어 있습니다.',
        );
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        handleNetworkError(err);
        onError(err?.message ?? '연결 오류');
      }
    }
  })();

  return () => ctrl.abort();
}
