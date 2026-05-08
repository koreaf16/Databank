/**
 * 파일: backend/src/modules/settings/report-templates/repository/reportTemplateRepository.ts
 * 역할: 보고서 마스터 템플릿(REPORT_MASTER_TEMPLATES) CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import oracledb from 'oracledb';
import {
  clobFetchHandler,
  requiredText,
  toNullableInt,
  toFlag,
  notFoundError,
  loadSql,
  has,
  nullableClob,
} from '../../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

export async function listReportTemplates(connection: any, options: any = {}) {
  const enabledOnly = options.enabledOnly !== false;

  const where = enabledOnly ? 'WHERE ENABLED = 1' : 'WHERE (:enabled_only = 0 OR ENABLED = 1)';
  const fullSql = `
    ${sql('selectReportTemplate.sql')}
    ${where}
    ORDER BY
      CASE WHEN CUSTOMER_ID IS NULL THEN 0 ELSE 1 END,
      CUSTOMER_ID,
      TEMPLATE_NAME
  `;

  const binds = enabledOnly ? {} : { enabled_only: 0 };
  const result = await connection.execute(
    fullSql,
    binds,
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchTypeHandler: clobFetchHandler },
  );

  return (result.rows || []).map(normalizeRow);
}

export async function createReportTemplate(connection: any, payload: any = {}) {
  const id = requiredText(payload.id, 'id');
  const name = requiredText(payload.name, 'name');
  const version = requiredText(payload.version, 'version');
  const customerId = toNullableInt(payload.customerId);

  await connection.execute(sql('insertReportTemplate.sql'), {
    id,
    customer_id: customerId,
    name,
    version,
    html: nullableClob(payload.html),
    css: nullableClob(payload.css),
    llm_prompt: nullableClob(payload.llmPrompt),
    enabled: toFlag(payload.enabled, true) ? 1 : 0,
  });

  return await findReportTemplateById(connection, id);
}

export async function updateReportTemplate(connection: any, templateId: string, payload: any = {}) {
  const id = requiredText(templateId, 'templateId');
  const current = await findReportTemplateById(connection, id);
  if (!current) throw notFoundError('Template not found');

  await connection.execute(sql('updateReportTemplate.sql'), {
    id,
    customer_id: has(payload, 'customerId') ? toNullableInt(payload.customerId) : current.customerId,
    name: has(payload, 'name') ? requiredText(payload.name, 'name') : current.name,
    version: has(payload, 'version') ? requiredText(payload.version, 'version') : current.version,
    html: nullableClob(has(payload, 'html') ? payload.html : current.html),
    css: nullableClob(has(payload, 'css') ? payload.css : current.css),
    llm_prompt: nullableClob(has(payload, 'llmPrompt') ? payload.llmPrompt : current.llmPrompt),
    enabled: has(payload, 'enabled') ? (toFlag(payload.enabled) ? 1 : 0) : current.enabled,
  });

  return await findReportTemplateById(connection, id);
}

export async function deleteReportTemplate(connection: any, templateId: string) {
  const id = requiredText(templateId, 'templateId');
  const current = await findReportTemplateById(connection, id);
  if (!current) throw notFoundError('Template not found');

  await connection.execute(sql('deleteReportTemplate.sql'), { id });
  return await findReportTemplateById(connection, id);
}

export async function findReportTemplateById(connection: any, templateId: string) {
  const fullSql = `${sql('selectReportTemplate.sql')} WHERE TEMPLATE_ID = :id`;
  const result = await connection.execute(
    fullSql,
    { id: templateId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchTypeHandler: clobFetchHandler },
  );
  const row = result.rows?.[0] || null;
  return row ? normalizeRow(row) : null;
}

function normalizeRow(row: any) {
  return {
    id: row.id,
    customerId: row.customerId ?? null,
    name: row.name,
    version: row.version,
    html: row.html ?? '',
    css: row.css ?? '',
    llmPrompt: row.llmPrompt ?? '',
    enabled: row.enabled,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toLocaleString('ko-KR') : null,
  };
}
