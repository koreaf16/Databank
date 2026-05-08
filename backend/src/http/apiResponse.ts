/**
 * 파일: backend/src/http/apiResponse.ts
 * 역할: API 응답 envelope({ ok, data, meta? } / { ok, error }) 헬퍼.
 */

import { Response } from 'express';

export interface ApiResponseMeta {
  total?: number;
  [key: string]: any;
}

export interface ApiErrorOptions {
  message: any;
  code?: string;
  detail?: any;
}

/**
 * 200 성공 응답.
 */
export function ok(res: Response, data: any, meta?: ApiResponseMeta) {
  const body: any = { ok: true, data };
  if (meta != null) body.meta = meta;
  res.json(body);
}

/**
 * 201 생성 성공 응답.
 */
export function created(res: Response, data: any) {
  res.status(201).json({ ok: true, data });
}

/**
 * 에러 응답 생성.
 */
export function errorResponse(res: Response, options: ApiErrorOptions, statusCode: number = 500) {
  const { message, code = 'INTERNAL', detail } = options;
  const body: any = { ok: false, error: { code, message } };
  if (detail !== undefined) body.error.detail = detail;
  res.status(statusCode).json(body);
}
