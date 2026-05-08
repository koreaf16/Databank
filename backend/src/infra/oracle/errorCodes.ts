/**
 * 파일: backend/src/infra/oracle/errorCodes.js
 * 역할: Oracle 에러 코드 상수 모음. ORA-XXXXX 번호와 의미를 한 곳에서 관리한다.
 *
 * 연관 파일:
 *   - infra/oracle/helpers.js  : isAlreadyExists, isUniqueError 등에서 참조
 *   - http/errors.js           : Oracle 에러 → HTTP 에러 변환 시 참조
 */

export const ORA = {
  ALREADY_EXISTS: 955,   // CREATE TABLE/INDEX 시 이미 존재
  COLUMN_EXISTS: 1430,   // ALTER TABLE ADD COLUMN 시 이미 존재
  CONSTRAINT_NAME_EXISTS: 2264, // ALTER TABLE ADD CONSTRAINT 시 이름 중복
  CONSTRAINT_EXISTS: 2275,      // ALTER TABLE ADD CONSTRAINT 시 동일 제약 존재
  UNIQUE_VIOLATION: 1,   // UNIQUE constraint 위반
  CHILD_RECORD: 2292,    // FK 참조 자식 row 존재
  LOCK_NOWAIT: 54,       // NOWAIT DDL 중 다른 세션이 테이블 사용 중
  NO_LISTENER: 12541,
  SERVICE_NOT_REGISTERED: 12514,
  INVALID_CREDENTIALS: 1017,
  ACCOUNT_LOCKED: 28000,
  POOL_MAX_REACHED: 24418,
  NO_HANDLER: 12516,
};

export function isOraError(error, code) {
  return Number(error?.errorNum) === code;
}

export function isAlreadyExists(error) {
  return isOraError(error, ORA.ALREADY_EXISTS)
    || isOraError(error, ORA.COLUMN_EXISTS)
    || isOraError(error, ORA.LOCK_NOWAIT);
}

export function isUniqueError(error) {
  return isOraError(error, ORA.UNIQUE_VIOLATION);
}

export function isChildRecordError(error) {
  return isOraError(error, ORA.CHILD_RECORD);
}
