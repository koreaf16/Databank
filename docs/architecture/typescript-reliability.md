# TypeScript 및 안정성 강화 가이드

본 문서는 Databank 백엔드 프로젝트에 도입된 TypeScript 설정과 시스템 안정성 강화 방안을 설명합니다.

## 1. 개요
프로젝트의 규모가 커짐에 따라 발생할 수 있는 런타임 에러를 방지하고, 유지보수 효율을 높이기 위해 TypeScript 및 관련 안정성 도구들을 도입하였습니다.

## 2. 주요 기술 스택
- **Language**: TypeScript (Strict Mode)
- **Runtime Engine**: Node.js + `tsx` (개발 시)
- **Validation**: Zod (환경 변수 및 데이터 검증)
- **Lint/Format**: ESLint + Prettier

## 3. 환경 변수 관리 (`env.local`)
보안 및 관리 편의성을 위해 모든 환경 변수는 **프로젝트 루트의 `env.local`** 파일에서 관리합니다.

### 설정 소스
- 위치: `../../env.local` (프로젝트 루트)
- 로드 방식: `backend/src/config/env.ts`에서 `dotenv`를 통해 명시적 로드.

### 검증 (Zod)
서버 기동 시 `env.ts`에서 필수 환경 변수의 존재 여부와 타입을 검증합니다. 변수가 누락되거나 형식이 틀린 경우 서버는 즉시 종료됩니다.

```typescript
// 예시: 필수 변수 검증
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.string().transform(Number),
});
```

## 4. 글로벌 에러 핸들링
시스템의 갑작스러운 종료를 방지하고 에러 원인을 추적하기 위해 글로벌 핸들러를 운영합니다.

- **Uncaught Exception**: 예상치 못한 코드 오류 발생 시 로그를 남기고 Graceful Shutdown을 시도합니다.
- **Unhandled Rejection**: Promise 체인에서 누락된 에러 처리를 감시합니다.
- **Express Error Handler**: `src/http/errorHandler.js`에서 API 응답 에러를 중앙 집중 관리합니다.

## 5. 개발 가이드라인

### 실행 명령어
- 개발 모드: `npm run dev` (`tsx`를 통한 실시간 리로드 및 TS 실행)
- 타입 체크: `npx tsc --noEmit`
- 코드 스타일 체크: `npm run lint`

### 파일 확장자 규칙
- 새로운 로직이나 핵심 모듈은 `.ts` 확장자를 사용합니다.
- 기존 `.js` 파일은 순차적으로 `.ts`로 마이그레이션합니다.
- TypeScript 파일 내에서 다른 TS 파일을 임포트할 때는 반드시 `.ts` 확장자를 명시해야 합니다 (NodeNext 모드 호환성).

## 6. 결론
이러한 설정을 통해 "동작만 하는 코드"가 아닌 "신뢰할 수 있고 예측 가능한 시스템"을 구축하는 것을 목표로 합니다.
