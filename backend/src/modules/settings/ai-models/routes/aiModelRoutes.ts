/**
 * 파일: backend/src/modules/settings/ai-models/routes/aiModelRoutes.js
 * 역할: AI_MODELS CRUD HTTP 라우트. /api/ai-models 경로.
 *
 * 연관 파일:
 *   - repository/aiModelRepository.js : DB 쿼리
 *   - infra/oracle/withConnection.js  : 읽기 전용 커넥션
 *   - infra/oracle/withTransaction.js : 쓰기 트랜잭션
 *   - http/asyncHandler.js            : 예외 → errorHandler
 *   - http/apiResponse.js             : ok/created envelope
 *   - http/errorHandler.js            : requireOracle guard
 */

import { Router } from 'express';
import { asyncHandler } from '../../../../http/asyncHandler.js';
import { ok, created } from '../../../../http/apiResponse.js';
import { requireOracle } from '../../../../http/errorHandler.js';
import { getCurrentUserId } from '../../../../http/currentUser.js';
import { hasPermission, requirePermission } from '../../../../http/rbac.js';
import { withOracleConnection } from '../../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../../infra/oracle/withTransaction.js';
import { logAudit } from '../../../audit/repository/auditRepository.js';
import {
  listAiModels,
  findAiModelById,
  createAiModel,
  updateAiModel,
  deleteAiModel,
} from '../repository/aiModelRepository.js';
import { clearModelCache } from '../../../knowledge-base/services/ai/aiModelResolver.js';

export const aiModelRouter = Router();

function redactApiKey(row: any, canViewKeys: boolean) {
  return canViewKeys ? row : { ...row, apiKey: null };
}

aiModelRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(req, res, 'ai.view')) return;
  const rows = await withOracleConnection(conn => listAiModels(conn));
  const canViewKeys = await hasPermission(req, 'ai.key');
  ok(res, rows.map((row: any) => redactApiKey(row, canViewKeys)));
}));

// GET /api/ai-models/probe?baseUrl=...&provider=ollama|openai|tei|auto
// auto: Ollama + OpenAI(vLLM) + TEI 병렬 탐지 후 합산 반환.
aiModelRouter.get('/probe', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(req, res, 'ai.manage')) return;
  const baseUrl = String(req.query.baseUrl || '').trim().replace(/\/$/, '');
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'http:// 또는 https://로 시작하는 주소를 입력하세요' } });
  }
  const provider = String(req.query.provider || 'ollama').toLowerCase();

  async function probeSingle(type: 'ollama' | 'openai' | 'tei'): Promise<any[]> {
    const url = type === 'ollama' ? `${baseUrl}/api/tags`
               : type === 'tei'   ? `${baseUrl}/info`
               :                    `${baseUrl}/v1/models`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const resp = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
      clearTimeout(timer);
      if (!resp.ok) return [];
      const data: any = await resp.json();
      if (type === 'ollama') {
        return (data.models || []).map((m: any) => ({
          name: m.name || m.model, size: m.size, paramSize: m.details?.parameter_size || null,
        }));
      }
      if (type === 'tei') {
        // TEI /info 응답: { model_id: "BAAI/bge-base-...", ... }
        return data.model_id ? [{ name: data.model_id, size: null, paramSize: null }] : [];
      }
      // OpenAI /v1/models 응답: { data: [{ id, ... }] }
      return (data.data || []).map((m: any) => ({ name: m.id, size: null, paramSize: null }));
    } catch {
      clearTimeout(timer);
      return [];
    }
  }

  try {
    let models: any[];
    if (provider === 'auto') {
      const [ollama, openai, tei] = await Promise.all([
        probeSingle('ollama'), probeSingle('openai'), probeSingle('tei'),
      ]);
      const seen = new Set<string>();
      models = [...ollama, ...openai, ...tei].filter(m => {
        if (!m.name || seen.has(m.name)) return false;
        seen.add(m.name);
        return true;
      });
      if (models.length === 0) {
        return res.status(502).json({ ok: false, error: { code: 'PROBE_FAILED', message: '연결 실패: Ollama, vLLM, TEI 모두 응답 없음' } });
      }
    } else {
      models = await probeSingle(provider === 'tei' ? 'tei' : provider === 'ollama' ? 'ollama' : 'openai');
    }
    ok(res, models);
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError';
    return res.status(502).json({
      ok: false,
      error: {
        code: isTimeout ? 'TIMEOUT' : 'PROBE_FAILED',
        message: isTimeout ? '서버 응답 없음 (6초 초과)' : `연결 실패: ${err.message}`,
      },
    });
  }
}));

aiModelRouter.get('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(req, res, 'ai.view')) return;
  const row = await withOracleConnection(conn => findAiModelById(conn, req.params.id));
  if (!row) {
    return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'AI 모델을 찾을 수 없습니다' } });
  }
  const canViewKeys = await hasPermission(req, 'ai.key');
  ok(res, redactApiKey(row, canViewKeys));
}));

aiModelRouter.post('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(req, res, 'ai.manage')) return;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'apiKey') && !await requirePermission(req, res, 'ai.key')) return;
  const row = await withOracleTransaction(async conn => {
    const result = await createAiModel(conn, req.body || {});
    await logAudit(conn, {
      userId: getCurrentUserId(req),
      action: 'create',
      entityType: 'ai_model',
      entityId: String(result.id),
      summary: `AI 모델 "${result.name}" 생성`,
      detail: { name: result.name, provider: result.provider, modelType: result.modelType, isDefault: result.isDefault },
      ipAddr: req.ip,
    });
    return result;
  });
  clearModelCache();
  created(res, row);
}));

aiModelRouter.patch('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(req, res, 'ai.manage')) return;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'apiKey') && !await requirePermission(req, res, 'ai.key')) return;
  const row = await withOracleTransaction(async conn => {
    const result = await updateAiModel(conn, req.params.id, req.body || {});
    const detail = { ...(req.body || {}) };
    if (Object.prototype.hasOwnProperty.call(detail, 'apiKey')) detail.apiKey = '[redacted]';
    await logAudit(conn, {
      userId: getCurrentUserId(req),
      action: 'update',
      entityType: 'ai_model',
      entityId: String(req.params.id),
      summary: `AI 모델 ID ${req.params.id} 수정`,
      detail,
      ipAddr: req.ip,
    });
    return result;
  });
  clearModelCache();
  ok(res, row);
}));

aiModelRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(req, res, 'ai.manage')) return;
  const row = await withOracleTransaction(async conn => {
    const result = await deleteAiModel(conn, req.params.id);
    await logAudit(conn, {
      userId: getCurrentUserId(req),
      action: 'delete',
      entityType: 'ai_model',
      entityId: String(req.params.id),
      summary: `AI 모델 ID ${req.params.id} 삭제`,
      ipAddr: req.ip,
    });
    return result;
  });
  clearModelCache();
  ok(res, row);
}));
