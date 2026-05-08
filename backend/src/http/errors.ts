/**
 * 파일: backend/src/http/errors.ts
 * 역할: HTTP 계층의 표준 에러 클래스. statusCode + code를 함께 갖는다.
 */

export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL') {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends ApiError {
  constructor(message: string = '입력값이 올바르지 않습니다') {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = '항목을 찾을 수 없습니다') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = '이미 존재하는 항목입니다') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class OracleUnavailableError extends ApiError {
  constructor(message: string = 'Oracle DB를 사용할 수 없습니다') {
    super(message, 503, 'ORACLE_UNAVAILABLE');
    this.name = 'OracleUnavailableError';
  }
}
