/**
 * 파일: backend/src/modules/settings/ai-models/repository/aiModelRepository.ts
 * 역할: AI_MODELS 테이블 CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import oracledb from 'oracledb';
import {
  requiredText,
  nullableText,
  toInt,
  toFlag,
  has,
  toOptional,
  validationError,
  notFoundError,
  loadSql,
} from '../../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

const VALID_STATUS          = new Set(['active', 'beta', 'inactive']);
const VALID_THINKING_MODE   = new Set(['auto', 'on', 'off']);
const VALID_THINKING_FAMILY = new Set(['none', 'qwen36', 'gemma4']);

export async function listAiModels(connection: any) {
  const fullSql = `${sql('selectAiModel.sql')} ORDER BY IS_DEFAULT DESC, NAME`;
  const result = await connection.execute(
    fullSql,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (result.rows || []).map(normalizeRow);
}

export async function findAiModelById(connection: any, modelId: number | string) {
  const id = toInt(modelId);
  if (!id) throw validationError('modelId가 유효하지 않습니다');

  const fullSql = `${sql('selectAiModel.sql')} WHERE MODEL_ID = :id`;
  const result = await connection.execute(
    fullSql,
    { id },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const row = result.rows?.[0] || null;
  return row ? normalizeRow(row) : null;
}

export async function createAiModel(connection: any, payload: any = {}) {
  const name = requiredText(payload.name, 'name');
  const status = validateStatus(nullableText(payload.status) || 'active');
  const modelType = nullableText(payload.modelType) || 'llm';
  const isDefault = toFlag(payload.isDefault);

  if (isDefault) {
    await connection.execute(sql('resetDefaultModelByType.sql'), { model_type: modelType });
  }

  const result = await connection.execute(sql('insertAiModel.sql'), {
    name,
    version:      nullableText(payload.version),
    provider:     nullableText(payload.provider) || 'anthropic',
    status,
    endpoint:     nullableText(payload.endpoint),
    api_key:      nullableText(payload.apiKey),
    tokens_used:  toInt(payload.tokensUsed) ?? 0,
    token_limit:  toInt(payload.tokenLimit) ?? 1000000,
    cost_month:   Number(payload.costMonth ?? 0),
    ctx_limit_kb: toInt(payload.contextLimitKb) ?? 0,
    is_training:  toFlag(payload.isTraining),
    is_default:   isDefault,
    notes:          nullableText(payload.notes),
    use_cases:      serializeUseCases(payload.useCases),
    model_type:     modelType,
    thinking_mode:  validateThinkingMode(nullableText(payload.thinkingMode) || 'auto'),
    thinking_family: validateThinkingFamily(nullableText(payload.thinkingFamily) || 'none'),
    out_id:         { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
  });

  return await findAiModelById(connection, result.outBinds.out_id[0]);
}

export async function updateAiModel(connection: any, modelId: number | string, payload: any = {}) {
  const id = toInt(modelId);
  if (!id) throw validationError('modelId가 유효하지 않습니다');
  const current = await findAiModelById(connection, id);
  if (!current) throw notFoundError('AI 모델을 찾을 수 없습니다');

  const newStatus = has(payload, 'status')
    ? validateStatus(nullableText(payload.status) || current.status)
    : current.status;
  const nextModelType = has(payload, 'modelType')
    ? (nullableText(payload.modelType) || 'llm')
    : (current.modelType || 'llm');
  const nextIsDefault = has(payload, 'isDefault')
    ? toFlag(payload.isDefault)
    : (current.isDefault ? 1 : 0);

  if (nextIsDefault) {
    await connection.execute(sql('resetDefaultModelExcludingId.sql'), { model_type: nextModelType, id });
  }

  await connection.execute(sql('updateAiModel.sql'), {
    id,
    name:         has(payload, 'name')            ? requiredText(payload.name, 'name') : current.name,
    version:      toOptional(payload, 'version',   current.version),
    provider:     toOptional(payload, 'provider',  current.provider),
    status:       newStatus,
    endpoint:     toOptional(payload, 'endpoint',  current.endpoint),
    api_key:      toOptional(payload, 'apiKey',    current.apiKey),
    token_limit:  has(payload, 'tokenLimit')       ? (toInt(payload.tokenLimit) ?? current.tokenLimit) : current.tokenLimit,
    cost_month:   has(payload, 'costMonth')        ? Number(payload.costMonth ?? 0) : current.costMonth,
    ctx_limit_kb: has(payload, 'contextLimitKb')   ? (toInt(payload.contextLimitKb) ?? 0) : (current.contextLimitKb ?? 0),
    is_training:  has(payload, 'isTraining')       ? toFlag(payload.isTraining) : (current.isTraining ? 1 : 0),
    is_default:   nextIsDefault,
    notes:           toOptional(payload, 'notes', current.notes),
    use_cases:       has(payload, 'useCases')         ? serializeUseCases(payload.useCases) : serializeUseCases(current.useCases),
    model_type:      nextModelType,
    thinking_mode:   has(payload, 'thinkingMode')
      ? validateThinkingMode(nullableText(payload.thinkingMode) || 'auto')
      : (current.thinkingMode || 'auto'),
    thinking_family: has(payload, 'thinkingFamily')
      ? validateThinkingFamily(nullableText(payload.thinkingFamily) || 'none')
      : (current.thinkingFamily || 'none'),
  });

  return await findAiModelById(connection, id);
}

export async function deleteAiModel(connection: any, modelId: number | string) {
  const id = toInt(modelId);
  if (!id) throw validationError('modelId가 유효하지 않습니다');
  const current = await findAiModelById(connection, id);
  if (!current) throw notFoundError('AI 모델을 찾을 수 없습니다');

  await connection.execute(sql('deleteAiModel.sql'), { id });
  return { id, deleted: true };
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function normalizeRow(row: any) {
  return {
    ...row,
    isTraining: row.isTraining === 1,
    isDefault:  row.isDefault === 1,
    useCases:   row.useCases ? row.useCases.split(',').filter(Boolean) : [],
    updatedAt:  row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

function serializeUseCases(value: any) {
  if (!value) return null;
  if (Array.isArray(value)) return value.join(',') || null;
  return String(value).trim() || null;
}

function validateStatus(value: string) {
  if (!VALID_STATUS.has(value)) {
    throw validationError('status는 active·beta·inactive 중 하나여야 합니다');
  }
  return value;
}

function validateThinkingMode(value: string) {
  if (!VALID_THINKING_MODE.has(value)) {
    throw validationError("thinkingMode는 'auto'·'on'·'off' 중 하나여야 합니다");
  }
  return value;
}

function validateThinkingFamily(value: string) {
  if (!VALID_THINKING_FAMILY.has(value)) {
    throw validationError("thinkingFamily는 'none'·'qwen36'·'gemma4' 중 하나여야 합니다");
  }
  return value;
}
