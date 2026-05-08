/**
 * 파일: backend/src/modules/metrics/repository/metricRepository.ts
 * 역할: METRIC_DEFINITIONS, MONITOR_TARGETS, METRIC_SAMPLES, TARGET_METRIC_OVERRIDES CRUD.
 * 연관 파일: modules/metrics/services/ingest.ts, services/risk.ts, routes/metricsRoutes.ts
 */

// ── 타입 ───────────────────────────────────────────────────────────────────────

export interface MetricDefinitionRow {
  metricId:      string;
  name:          string;
  systemType:    string;
  category:      string;
  unit:          string;
  warnThreshold: number | null;
  critThreshold: number | null;
  direction:     string;
  description:   string | null;
  enabled:       number;
}

export interface MonitorTargetRow {
  targetId:        number;
  name:            string;
  systemType:      string;
  customerId:      number | null;
  deptId:          number | null;
  serviceMasterId: string | null;
  hostname:        string | null;
  endpoint:        string | null;
  status:          string;
  description:     string | null;
  createdBy:       number | null;
  createdAt:       Date;
}

export interface MetricSampleInsert {
  targetId:    number;
  metricId:    string;
  dimensionKey?:   string | null;
  dimensionValue?: string | null;
  rawLabel?:       string | null;
  collectedAt: Date;
  value:       number;
  status:      'ok' | 'warn' | 'crit';
  source:      'agent' | 'manual' | 'report-parse';
  sourceRef:   string | null;
}

// ── METRIC_DEFINITIONS ────────────────────────────────────────────────────────

export async function listDefinitions(
  conn: any,
  opts: { systemType?: string; enabledOnly?: boolean } = {},
): Promise<MetricDefinitionRow[]> {
  let sql = `
    SELECT METRIC_ID AS "metricId", NAME AS "name", SYSTEM_TYPE AS "systemType",
           CATEGORY AS "category", UNIT AS "unit",
           WARN_THRESHOLD AS "warnThreshold", CRIT_THRESHOLD AS "critThreshold",
           DIRECTION AS "direction", DESCRIPTION AS "description", ENABLED AS "enabled"
    FROM METRIC_DEFINITIONS WHERE 1=1`;
  const binds: any = {};
  if (opts.enabledOnly !== false) { sql += ` AND ENABLED = 1`; }
  if (opts.systemType) { sql += ` AND SYSTEM_TYPE = :systemType`; binds.systemType = opts.systemType; }
  sql += ` ORDER BY SYSTEM_TYPE, METRIC_ID`;
  const result = await conn.execute(sql, binds);
  return result.rows || [];
}

export async function findDefinition(conn: any, metricId: string): Promise<MetricDefinitionRow | null> {
  const result = await conn.execute(
    `SELECT METRIC_ID AS "metricId", NAME AS "name", SYSTEM_TYPE AS "systemType",
            CATEGORY AS "category", UNIT AS "unit",
            WARN_THRESHOLD AS "warnThreshold", CRIT_THRESHOLD AS "critThreshold",
            DIRECTION AS "direction", DESCRIPTION AS "description", ENABLED AS "enabled"
     FROM METRIC_DEFINITIONS WHERE METRIC_ID = :metricId`,
    { metricId },
  );
  return result.rows?.[0] || null;
}

export async function upsertDefinition(conn: any, def: Partial<MetricDefinitionRow> & { metricId: string }) {
  await conn.execute(
    `MERGE INTO METRIC_DEFINITIONS d USING (SELECT :metricId AS metric_id FROM DUAL) src
     ON (d.METRIC_ID = src.metric_id)
     WHEN MATCHED THEN UPDATE SET
       NAME=:name, SYSTEM_TYPE=:systemType, CATEGORY=:category, UNIT=:unit,
       WARN_THRESHOLD=:warnThreshold, CRIT_THRESHOLD=:critThreshold,
       DIRECTION=:direction, DESCRIPTION=:description, ENABLED=:enabled
     WHEN NOT MATCHED THEN INSERT
       (METRIC_ID, NAME, SYSTEM_TYPE, CATEGORY, UNIT, WARN_THRESHOLD, CRIT_THRESHOLD, DIRECTION, DESCRIPTION, ENABLED)
     VALUES (:metricId, :name, :systemType, :category, :unit, :warnThreshold, :critThreshold, :direction, :description, :enabled)`,
    {
      metricId:      def.metricId,
      name:          def.name ?? '',
      systemType:    def.systemType ?? 'oracle',
      category:      def.category ?? 'capacity',
      unit:          def.unit ?? '%',
      warnThreshold: def.warnThreshold ?? null,
      critThreshold: def.critThreshold ?? null,
      direction:     def.direction ?? 'high',
      description:   def.description ?? null,
      enabled:       def.enabled ?? 1,
    },
  );
}

export async function softDeleteDefinition(conn: any, metricId: string) {
  await conn.execute(`UPDATE METRIC_DEFINITIONS SET ENABLED=0 WHERE METRIC_ID=:metricId`, { metricId });
}

// ── MONITOR_TARGETS ───────────────────────────────────────────────────────────

export async function listTargets(
  conn: any,
  opts: { customerId?: number; systemType?: string; status?: string } = {},
): Promise<MonitorTargetRow[]> {
  let sql = `
    SELECT TARGET_ID AS "targetId", NAME AS "name", SYSTEM_TYPE AS "systemType",
           CUSTOMER_ID AS "customerId", DEPT_ID AS "deptId",
           SERVICE_MASTER_ID AS "serviceMasterId", HOSTNAME AS "hostname",
           ENDPOINT AS "endpoint", STATUS AS "status",
           DESCRIPTION AS "description", CREATED_BY AS "createdBy", CREATED_AT AS "createdAt"
    FROM MONITOR_TARGETS WHERE 1=1`;
  const binds: any = {};
  if (opts.customerId != null) { sql += ` AND CUSTOMER_ID = :customerId`; binds.customerId = opts.customerId; }
  if (opts.systemType)         { sql += ` AND SYSTEM_TYPE = :systemType`; binds.systemType = opts.systemType; }
  if (opts.status)             { sql += ` AND STATUS = :status`;           binds.status     = opts.status; }
  else                         { sql += ` AND STATUS != 'retired'`; }
  sql += ` ORDER BY NAME`;
  const result = await conn.execute(sql, binds);
  return result.rows || [];
}

export async function insertTarget(
  conn: any,
  payload: Omit<MonitorTargetRow, 'targetId' | 'createdAt'>,
): Promise<number> {
  const result = await conn.execute(
    `INSERT INTO MONITOR_TARGETS
       (NAME, SYSTEM_TYPE, CUSTOMER_ID, DEPT_ID, SERVICE_MASTER_ID, HOSTNAME, ENDPOINT, STATUS, DESCRIPTION, CREATED_BY, UPDATED_AT)
     VALUES (:name, :systemType, :customerId, :deptId, :serviceMasterId, :hostname, :endpoint, :status, :description, :createdBy, SYSTIMESTAMP)
     RETURNING TARGET_ID INTO :targetId`,
    {
      name:           payload.name,
      systemType:     payload.systemType,
      customerId:     payload.customerId ?? null,
      deptId:         payload.deptId ?? null,
      serviceMasterId:payload.serviceMasterId ?? null,
      hostname:       payload.hostname ?? null,
      endpoint:       payload.endpoint ?? null,
      status:         payload.status || 'active',
      description:    payload.description ?? null,
      createdBy:      payload.createdBy ?? null,
      targetId:       { type: 2001 /* NUMBER */, dir: 3003 /* BIND_OUT */ },
    },
  );
  return (result.outBinds as any)?.targetId?.[0] ?? result.lastRowid;
}

export async function updateTarget(conn: any, targetId: number, payload: Partial<MonitorTargetRow>) {
  const sets: string[] = [];
  const binds: any = { targetId };
  if (payload.name        !== undefined) { sets.push(`NAME=:name`);                   binds.name           = payload.name; }
  if (payload.systemType  !== undefined) { sets.push(`SYSTEM_TYPE=:systemType`);      binds.systemType     = payload.systemType; }
  if (payload.hostname    !== undefined) { sets.push(`HOSTNAME=:hostname`);           binds.hostname       = payload.hostname; }
  if (payload.endpoint    !== undefined) { sets.push(`ENDPOINT=:endpoint`);           binds.endpoint       = payload.endpoint; }
  if (payload.status      !== undefined) { sets.push(`STATUS=:status`);              binds.status         = payload.status; }
  if (payload.description !== undefined) { sets.push(`DESCRIPTION=:description`);    binds.description    = payload.description; }
  if (!sets.length) return;
  sets.push(`UPDATED_AT=SYSTIMESTAMP`);
  await conn.execute(`UPDATE MONITOR_TARGETS SET ${sets.join(',')} WHERE TARGET_ID=:targetId`, binds);
}

export async function deleteTarget(conn: any, targetId: number) {
  await conn.execute(`UPDATE MONITOR_TARGETS SET STATUS='retired', UPDATED_AT=SYSTIMESTAMP WHERE TARGET_ID=:targetId`, { targetId });
}

// ── METRIC_SAMPLES ────────────────────────────────────────────────────────────

export async function insertSamplesBatch(conn: any, samples: MetricSampleInsert[]) {
  for (const s of samples) {
    await conn.execute(
      `INSERT INTO METRIC_SAMPLES
         (TARGET_ID, METRIC_ID, DIMENSION_KEY, DIMENSION_VALUE, RAW_LABEL,
          COLLECTED_AT, VALUE, STATUS, SOURCE, SOURCE_REF)
       VALUES
         (:targetId, :metricId, :dimensionKey, :dimensionValue, :rawLabel,
          :collectedAt, :value, :status, :source, :sourceRef)`,
      {
        targetId:       s.targetId,
        metricId:       s.metricId,
        dimensionKey:   s.dimensionKey ?? null,
        dimensionValue: s.dimensionValue ?? null,
        rawLabel:       s.rawLabel ?? null,
        collectedAt:    s.collectedAt,
        value:          s.value,
        status:         s.status,
        source:         s.source,
        sourceRef:      s.sourceRef ?? null,
      },
    );
  }
}

export async function getSamples(
  conn: any,
  opts: { targetId: number; metricId?: string; dimensionKey?: string; dimensionValue?: string; from?: Date; to?: Date; limit?: number },
) {
  let sql = `
    SELECT TARGET_ID AS "targetId", METRIC_ID AS "metricId",
           DIMENSION_KEY AS "dimensionKey", DIMENSION_VALUE AS "dimensionValue",
           RAW_LABEL AS "rawLabel",
           COLLECTED_AT AS "collectedAt", VALUE AS "value",
           STATUS AS "status", SOURCE AS "source", SOURCE_REF AS "sourceRef"
    FROM METRIC_SAMPLES
    WHERE TARGET_ID = :targetId`;
  const binds: any = { targetId: opts.targetId };
  if (opts.metricId)       { sql += ` AND METRIC_ID = :metricId`; binds.metricId = opts.metricId; }
  if (opts.dimensionKey)   { sql += ` AND NVL(DIMENSION_KEY, '-') = :dimensionKey`; binds.dimensionKey = opts.dimensionKey; }
  if (opts.dimensionValue) { sql += ` AND NVL(DIMENSION_VALUE, '-') = :dimensionValue`; binds.dimensionValue = opts.dimensionValue; }
  if (opts.from)           { sql += ` AND COLLECTED_AT >= :from`;  binds.from     = opts.from; }
  if (opts.to)             { sql += ` AND COLLECTED_AT <= :to`;    binds.to       = opts.to; }
  sql += ` ORDER BY COLLECTED_AT`;
  if (opts.limit)    { sql += ` FETCH FIRST ${opts.limit} ROWS ONLY`; }
  const result = await conn.execute(sql, binds);
  return result.rows || [];
}

// ── RISK 쿼리 ─────────────────────────────────────────────────────────────────

export async function getRisk(conn: any, opts: { customerId?: number; limit?: number }) {
  const binds: any = { customerId: opts.customerId ?? null };
  const result = await conn.execute(
    `WITH latest AS (
       SELECT s.TARGET_ID, s.METRIC_ID, s.DIMENSION_KEY, s.DIMENSION_VALUE, s.RAW_LABEL,
              s.VALUE, s.STATUS, s.COLLECTED_AT, s.SOURCE, s.SOURCE_REF,
              ROW_NUMBER() OVER (
                PARTITION BY s.TARGET_ID, s.METRIC_ID, NVL(s.DIMENSION_KEY, '-'), NVL(s.DIMENSION_VALUE, '-')
                ORDER BY s.COLLECTED_AT DESC
              ) rn
       FROM METRIC_SAMPLES s
       WHERE s.COLLECTED_AT >= SYSTIMESTAMP - INTERVAL '7' DAY
     )
     SELECT t.TARGET_ID AS "targetId", t.NAME AS "targetName", t.SYSTEM_TYPE AS "systemType",
            t.CUSTOMER_ID AS "customerId", t.HOSTNAME AS "hostname",
            d.NAME AS "metricName", d.UNIT AS "unit", d.DIRECTION AS "direction",
            l.METRIC_ID AS "metricId", l.DIMENSION_KEY AS "dimensionKey",
            l.DIMENSION_VALUE AS "dimensionValue", l.RAW_LABEL AS "rawLabel",
            l.VALUE AS "value", l.STATUS AS "status",
            l.COLLECTED_AT AS "collectedAt", l.SOURCE AS "source", l.SOURCE_REF AS "sourceRef"
     FROM latest l
     JOIN MONITOR_TARGETS    t ON t.TARGET_ID = l.TARGET_ID
     JOIN METRIC_DEFINITIONS d ON d.METRIC_ID = l.METRIC_ID
     WHERE l.rn = 1
       AND l.STATUS IN ('warn', 'crit')
       AND (:customerId IS NULL OR t.CUSTOMER_ID = :customerId)
     ORDER BY DECODE(l.STATUS, 'crit', 1, 'warn', 2, 3), l.VALUE DESC
     FETCH FIRST ${opts.limit ?? 50} ROWS ONLY`,
    binds,
  );
  return result.rows || [];
}

export async function getLatestMetrics(conn: any, opts: { customerId?: number; targetId?: number; limit?: number }) {
  const binds: any = {
    customerId: opts.customerId ?? null,
    targetId:   opts.targetId ?? null,
  };
  const result = await conn.execute(
    `WITH latest AS (
       SELECT s.TARGET_ID, s.METRIC_ID, s.DIMENSION_KEY, s.DIMENSION_VALUE, s.RAW_LABEL,
              s.VALUE, s.STATUS, s.COLLECTED_AT, s.SOURCE, s.SOURCE_REF,
              ROW_NUMBER() OVER (
                PARTITION BY s.TARGET_ID, s.METRIC_ID, NVL(s.DIMENSION_KEY, '-'), NVL(s.DIMENSION_VALUE, '-')
                ORDER BY s.COLLECTED_AT DESC
              ) rn
       FROM METRIC_SAMPLES s
       WHERE s.COLLECTED_AT >= SYSTIMESTAMP - INTERVAL '365' DAY
     )
     SELECT t.TARGET_ID AS "targetId", t.NAME AS "targetName", t.SYSTEM_TYPE AS "systemType",
            t.CUSTOMER_ID AS "customerId", t.HOSTNAME AS "hostname",
            d.NAME AS "metricName", d.UNIT AS "unit", d.DIRECTION AS "direction",
            l.METRIC_ID AS "metricId", l.DIMENSION_KEY AS "dimensionKey",
            l.DIMENSION_VALUE AS "dimensionValue", l.RAW_LABEL AS "rawLabel",
            l.VALUE AS "value", l.STATUS AS "status",
            l.COLLECTED_AT AS "collectedAt", l.SOURCE AS "source", l.SOURCE_REF AS "sourceRef"
     FROM latest l
     JOIN MONITOR_TARGETS    t ON t.TARGET_ID = l.TARGET_ID
     JOIN METRIC_DEFINITIONS d ON d.METRIC_ID = l.METRIC_ID
     WHERE l.rn = 1
       AND (:customerId IS NULL OR t.CUSTOMER_ID = :customerId)
       AND (:targetId IS NULL OR t.TARGET_ID = :targetId)
     ORDER BY DECODE(l.STATUS, 'crit', 1, 'warn', 2, 'ok', 3, 4), l.COLLECTED_AT DESC
     FETCH FIRST ${opts.limit ?? 200} ROWS ONLY`,
    binds,
  );
  return result.rows || [];
}

// ── TARGET_METRIC_OVERRIDES ───────────────────────────────────────────────────

export async function upsertOverride(
  conn: any,
  targetId: number,
  metricId: string,
  payload: { warnThreshold?: number | null; critThreshold?: number | null; reason?: string; updatedBy?: number },
) {
  await conn.execute(
    `MERGE INTO TARGET_METRIC_OVERRIDES o
     USING (SELECT :targetId AS tid, :metricId AS mid FROM DUAL) src
     ON (o.TARGET_ID = src.tid AND o.METRIC_ID = src.mid)
     WHEN MATCHED THEN UPDATE SET
       WARN_THRESHOLD=:warnThreshold, CRIT_THRESHOLD=:critThreshold,
       REASON=:reason, UPDATED_BY=:updatedBy, UPDATED_AT=SYSTIMESTAMP
     WHEN NOT MATCHED THEN INSERT
       (TARGET_ID, METRIC_ID, WARN_THRESHOLD, CRIT_THRESHOLD, REASON, UPDATED_BY)
     VALUES (:targetId, :metricId, :warnThreshold, :critThreshold, :reason, :updatedBy)`,
    {
      targetId,
      metricId,
      warnThreshold: payload.warnThreshold ?? null,
      critThreshold: payload.critThreshold ?? null,
      reason:        payload.reason ?? null,
      updatedBy:     payload.updatedBy ?? null,
    },
  );
}
