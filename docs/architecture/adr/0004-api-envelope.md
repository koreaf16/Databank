# ADR 0004 — API 응답 envelope 채택

## 상태
Accepted

## 컨텍스트

기존 `server.js`는 성공 시 raw row(또는 array)를 그대로 반환하고, 실패 시에만 `{ error, detail }` JSON을 반환한다. 클라이언트가 응답 형태를 추측해야 하고(`Array.isArray(rows)` 같은 분기), 페이징 메타데이터를 담을 표준 자리도 없다.

후보:
- (a) raw 유지 + 페이징은 헤더(`X-Total-Count`)
- (b) envelope `{ ok, data, meta?, error? }`
- (c) JSON:API 같은 무거운 표준

## 결정

**(b) envelope 채택. 단 PDF 등 바이너리는 우회.**

```
성공: { "ok": true, "data": <payload>, "meta": { "total": N }? }
실패: { "ok": false, "error": { "code", "message", "detail"? } }
```

에러 코드 5종으로 시작: `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `ORACLE_UNAVAILABLE`, `INTERNAL`.

## 결과

- 장점:
  - 클라이언트 응답 분기 단일화
  - 메타데이터 자리 확보(페이징, 정렬 정보)
  - 에러 코드 표준화로 i18n/분기 처리 용이
- 단점:
  - 기존 라우트 모두 마이그레이션 필요(점진 전환)
  - 응답 본문이 한 단계 깊어짐

## 호환 마이그레이션

`shared/api/apiClient.js`가 양쪽을 지원:
- `body.ok === true`: `data` 풀어서 반환
- `body.ok === false`: `ApiError(body.error)` throw
- `body.ok === undefined`: raw 통과(backward-compat)

Phase 1에서 메뉴별로 envelope 적용 → Phase 2 종료 시 100% envelope.

## 바이너리 응답 정책

PDF 등은 `Content-Type: application/pdf` + `Content-Disposition: attachment`로 직접 전송. 에러 시에는 envelope JSON으로 회귀.

## 관련
- [../api-conventions.md](../api-conventions.md)
- [../backend.md](../backend.md)
- [../frontend.md](../frontend.md)
