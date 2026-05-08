# API 응답 규약

모든 `/api/*` 엔드포인트는 envelope 응답을 따른다. 단 PDF/바이너리 응답은 우회한다.

## 응답 envelope

### 성공
```
HTTP 200 (또는 201 Create)
Content-Type: application/json

{
  "ok": true,
  "data": <payload>,
  "meta": { "total": 123 }    // 선택 — 목록 페이징 시
}
```

### 실패
```
HTTP 4xx 또는 5xx
Content-Type: application/json

{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "한국어 메시지",
    "detail": <optional>      // 디버깅용 추가 정보(서버 5xx는 detail 노출 제한)
  }
}
```

### 바이너리 (PDF 등)
- envelope 미적용
- `Content-Type: application/pdf` + `Content-Disposition: attachment; filename="..."`
- 에러 시에는 envelope JSON으로 회귀

## 에러 코드 (초기 5종)

| code | HTTP | 의미 | 발생 위치 |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | 입력값 누락/형식 오류 | validators 또는 Repository requiredText |
| `NOT_FOUND` | 404 | 리소스 없음 | Repository select 결과 0 |
| `CONFLICT` | 409 | 중복 키, 이미 존재 | Oracle ORA-00001 매핑 |
| `ORACLE_UNAVAILABLE` | 503 | DB 미설정/연결 실패 | `ensureOracleConfigured` |
| `INTERNAL` | 500 | 그 외 처리되지 않은 오류 | 글로벌 catch |

신규 코드 추가는 ADR 또는 본 문서 PR로 반영.

## 명명 규칙

- 경로: kebab-case (예: `/api/support-history`, `/api/weekly-reports`)
- 쿼리스트링: camelCase (예: `?customerId=&engineerId=&from=&to=`)
- JSON 키: camelCase
- 시각 필드: ISO 8601 (예: `"startAt": "2026-05-12T09:00:00"`)

## 페이징

```
GET /api/support-history?from=&to=&page=1&pageSize=50

응답:
{
  "ok": true,
  "data": [...],
  "meta": { "total": 1234, "page": 1, "pageSize": 50 }
}
```

- `pageSize` 기본 50, 최대 200
- `page` 1-based

## 호환 마이그레이션 정책

기존 라우트가 raw 응답이면 `apiClient.js`가 `body.ok === undefined` 시 raw 통과시킨다(backward-compat). Phase 1 메뉴별 작업이 끝나면 백엔드도 100% envelope.

## 클라이언트 사용

```js
// frontend/src/shared/api/apiClient.js
async function apiGet(path) {
  const res = await fetch(BASE + path);
  const body = await res.json();
  if (body && body.ok === true) return body.data;
  if (body && body.ok === false) throw new ApiError(body.error);
  if (Array.isArray(body) || (body && typeof body === 'object')) return body; // backward-compat
  throw new Error('Unexpected response');
}
```

## 관련 문서
- [backend.md](backend.md)
- [adr/0004-api-envelope.md](adr/0004-api-envelope.md)
