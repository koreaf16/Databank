/**
 * 파일: frontend/src/shared/api/errors.ts
 * 역할: API 호출 실패 시 던지는 클라이언트 에러 클래스.
 */

export class ApiError extends Error {
  public status: number;
  public code: string;
  public detail: any;

  constructor(message: string, status: number = 500, code: string = 'INTERNAL', detail?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }

  get isValidation() { return this.code === 'VALIDATION_ERROR'; }
  get isNotFound()   { return this.code === 'NOT_FOUND'; }
  get isConflict()   { return this.code === 'CONFLICT'; }
  get isUnavailable(){ return this.code === 'ORACLE_UNAVAILABLE'; }
}
