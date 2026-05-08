/**
 * 파일: backend/src/modules/metrics/services/ingestService.ts
 * 역할: 메트릭 샘플 배치 수집. 임계값 결정 로직(direction + override 우선순위) 포함.
 * 연관 파일: repository/metricRepository.ts, routes/metricsRoutes.ts
 */

import { findDefinition, insertSamplesBatch } from '../repository/metricRepository.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import { logAudit } from '../../audit/repository/auditRepository.js';

export interface IngestSample {
  targetId:    number;
  metricId:    string;
  dimensionKey?:   string | null;
  dimensionValue?: string | null;
  rawLabel?:       string | null;
  collectedAt: Date;
  value:       number;
  source:      'agent' | 'manual' | 'report-parse';
  sourceRef?:  string | null;
}

// 캐시: metricId → { warnThreshold, critThreshold, direction, expiresAt }
const defCache = new Map<string, { warn: number | null; crit: number | null; direction: string; expiresAt: number }>();
const CACHE_TTL = 60_000;

function cacheGet(key: string) {
  const entry = defCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry;
  defCache.delete(key);
  return null;
}

async function resolveThresholds(conn: any, targetId: number, metricId: string) {
  const cached = cacheGet(`def:${metricId}`);
  if (!cached) {
    const def = await findDefinition(conn, metricId);
    if (!def) return { warn: null, crit: null, direction: 'high' };
    defCache.set(`def:${metricId}`, {
      warn: def.warnThreshold, crit: def.critThreshold, direction: def.direction,
      expiresAt: Date.now() + CACHE_TTL,
    });
  }

  const override = await conn.execute(
    `SELECT WARN_THRESHOLD AS "warn", CRIT_THRESHOLD AS "crit"
     FROM TARGET_METRIC_OVERRIDES WHERE TARGET_ID=:targetId AND METRIC_ID=:metricId`,
    { targetId, metricId },
  );
  const ov = override.rows?.[0];
  const base = defCache.get(`def:${metricId}`)!;
  return {
    warn:      ov?.warn      ?? base.warn,
    crit:      ov?.crit      ?? base.crit,
    direction: base.direction,
  };
}

function determineStatus(value: number, warn: number | null, crit: number | null, direction: string): 'ok' | 'warn' | 'crit' {
  if (warn == null || crit == null) return 'ok';
  if (direction === 'low') {
    if (value <= crit) return 'crit';
    if (value <= warn) return 'warn';
    return 'ok';
  }
  if (value >= crit) return 'crit';
  if (value >= warn) return 'warn';
  return 'ok';
}

export async function ingestSamples(
  samples: IngestSample[],
  userId: number | null,
): Promise<{ inserted: number }> {
  let inserted = 0;

  await withOracleTransaction(async conn => {
    const withStatus = await Promise.all(
      samples.map(async s => {
        const { warn, crit, direction } = await resolveThresholds(conn, s.targetId, s.metricId);
        return {
          targetId:    s.targetId,
          metricId:    s.metricId,
          dimensionKey:   s.dimensionKey ?? null,
          dimensionValue: s.dimensionValue ?? null,
          rawLabel:       s.rawLabel ?? null,
          collectedAt: s.collectedAt,
          value:       s.value,
          status:      determineStatus(s.value, warn, crit, direction),
          source:      s.source,
          sourceRef:   s.sourceRef ?? null,
        };
      }),
    );

    await insertSamplesBatch(conn, withStatus);
    inserted = withStatus.length;

    if (userId) {
      await logAudit(conn, {
        userId,
        action: 'metric_ingest',
        entityType: 'METRIC_SAMPLES',
        entityId: null,
        summary: `batch=${inserted}`,
      });
    }
  });

  return { inserted };
}
