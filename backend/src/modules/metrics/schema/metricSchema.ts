/**
 * 파일: backend/src/modules/metrics/schema/metricSchema.ts
 * 역할: METRIC_DEFINITIONS, MONITOR_TARGETS, METRIC_SAMPLES, TARGET_METRIC_OVERRIDES DDL.
 *       멱등 실행 (ORA-00955 무시).
 * 연관 파일: scripts/initMetricSchema.ts
 */

import { isAlreadyExists } from '../../../infra/oracle/errorCodes.js';

const DDL: string[] = [
  `CREATE TABLE METRIC_DEFINITIONS (
    METRIC_ID      VARCHAR2(64 CHAR)  NOT NULL,
    NAME           VARCHAR2(200 CHAR) NOT NULL,
    SYSTEM_TYPE    VARCHAR2(40 CHAR)  NOT NULL,
    CATEGORY       VARCHAR2(40 CHAR)  NOT NULL,
    UNIT           VARCHAR2(20 CHAR)  NOT NULL,
    WARN_THRESHOLD NUMBER,
    CRIT_THRESHOLD NUMBER,
    DIRECTION      VARCHAR2(8 CHAR)   DEFAULT 'high' NOT NULL,
    DESCRIPTION    VARCHAR2(500 CHAR),
    ENABLED        NUMBER(1)          DEFAULT 1 NOT NULL,
    CREATED_AT     TIMESTAMP          DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_METRIC_DEFINITIONS PRIMARY KEY (METRIC_ID)
  )`,
  `CREATE INDEX IDX_METRIC_DEF_SYSTYPE ON METRIC_DEFINITIONS(SYSTEM_TYPE, ENABLED)`,

  `CREATE TABLE MONITOR_TARGETS (
    TARGET_ID         NUMBER             GENERATED ALWAYS AS IDENTITY,
    NAME              VARCHAR2(200 CHAR) NOT NULL,
    SYSTEM_TYPE       VARCHAR2(40 CHAR)  NOT NULL,
    CUSTOMER_ID       NUMBER,
    DEPT_ID           NUMBER,
    SERVICE_MASTER_ID VARCHAR2(100 CHAR),
    HOSTNAME          VARCHAR2(200 CHAR),
    ENDPOINT          VARCHAR2(500 CHAR),
    STATUS            VARCHAR2(20 CHAR)  DEFAULT 'active' NOT NULL,
    DESCRIPTION       VARCHAR2(500 CHAR),
    CREATED_BY        NUMBER,
    CREATED_AT        TIMESTAMP          DEFAULT SYSTIMESTAMP NOT NULL,
    UPDATED_AT        TIMESTAMP,
    CONSTRAINT PK_MONITOR_TARGETS   PRIMARY KEY (TARGET_ID),
    CONSTRAINT FK_TARGET_CUSTOMER   FOREIGN KEY (CUSTOMER_ID)       REFERENCES CUSTOMERS(CUSTOMER_ID),
    CONSTRAINT FK_TARGET_DEPT       FOREIGN KEY (DEPT_ID)           REFERENCES DEPARTMENTS(DEPT_ID),
    CONSTRAINT FK_TARGET_SERVICE    FOREIGN KEY (SERVICE_MASTER_ID) REFERENCES SERVICE_MASTERS(MASTER_ID),
    CONSTRAINT FK_TARGET_CREATOR    FOREIGN KEY (CREATED_BY)        REFERENCES USERS(USER_ID)
  )`,
  `CREATE INDEX IDX_TARGET_CUSTOMER ON MONITOR_TARGETS(CUSTOMER_ID, STATUS)`,
  `CREATE INDEX IDX_TARGET_SYSTYPE  ON MONITOR_TARGETS(SYSTEM_TYPE, STATUS)`,
  `CREATE INDEX IDX_TARGET_DEPT     ON MONITOR_TARGETS(DEPT_ID, STATUS)`,

  `CREATE TABLE METRIC_SAMPLES (
    SAMPLE_ID    NUMBER             GENERATED ALWAYS AS IDENTITY,
    TARGET_ID    NUMBER             NOT NULL,
    METRIC_ID    VARCHAR2(64 CHAR)  NOT NULL,
    DIMENSION_KEY   VARCHAR2(80 CHAR),
    DIMENSION_VALUE VARCHAR2(200 CHAR),
    RAW_LABEL       VARCHAR2(300 CHAR),
    COLLECTED_AT TIMESTAMP          NOT NULL,
    VALUE        NUMBER             NOT NULL,
    STATUS       VARCHAR2(8 CHAR)   NOT NULL,
    SOURCE       VARCHAR2(20 CHAR)  NOT NULL,
    SOURCE_REF   VARCHAR2(200 CHAR),
    CONSTRAINT PK_METRIC_SAMPLES PRIMARY KEY (SAMPLE_ID, COLLECTED_AT)
  )
  PARTITION BY RANGE (COLLECTED_AT)
  INTERVAL (NUMTOYMINTERVAL(1, 'MONTH'))
  (
    PARTITION P_INIT VALUES LESS THAN (TO_DATE('2026-01-01', 'YYYY-MM-DD'))
  )`,
  `CREATE INDEX IDX_SAMPLES_TARGET_TIME ON METRIC_SAMPLES(TARGET_ID, COLLECTED_AT DESC) LOCAL`,
  `CREATE INDEX IDX_SAMPLES_METRIC_TIME ON METRIC_SAMPLES(METRIC_ID, COLLECTED_AT)      LOCAL`,
  `ALTER TABLE METRIC_SAMPLES ADD DIMENSION_KEY VARCHAR2(80 CHAR)`,
  `ALTER TABLE METRIC_SAMPLES ADD DIMENSION_VALUE VARCHAR2(200 CHAR)`,
  `ALTER TABLE METRIC_SAMPLES ADD RAW_LABEL VARCHAR2(300 CHAR)`,

  `CREATE TABLE TARGET_METRIC_OVERRIDES (
    TARGET_ID      NUMBER             NOT NULL,
    METRIC_ID      VARCHAR2(64 CHAR)  NOT NULL,
    WARN_THRESHOLD NUMBER,
    CRIT_THRESHOLD NUMBER,
    REASON         VARCHAR2(500 CHAR),
    UPDATED_BY     NUMBER,
    UPDATED_AT     TIMESTAMP          DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_TARGET_METRIC_OVERRIDE PRIMARY KEY (TARGET_ID, METRIC_ID),
    CONSTRAINT FK_OVERRIDE_TARGET FOREIGN KEY (TARGET_ID) REFERENCES MONITOR_TARGETS(TARGET_ID),
    CONSTRAINT FK_OVERRIDE_METRIC FOREIGN KEY (METRIC_ID) REFERENCES METRIC_DEFINITIONS(METRIC_ID)
  )`,
];

const DEFAULT_DEFINITIONS = [
  { metricId: 'oracle.tablespace.usage', name: 'Oracle tablespace usage', systemType: 'oracle', category: 'capacity', unit: '%', warnThreshold: 80, critThreshold: 90, direction: 'high', description: 'Parsed tablespace usage percent' },
  { metricId: 'oracle.tablespace.total_mb', name: 'Oracle tablespace total size', systemType: 'oracle', category: 'capacity', unit: 'MB', warnThreshold: null, critThreshold: null, direction: 'high', description: 'Parsed tablespace total size in MB' },
  { metricId: 'oracle.tablespace.used_mb', name: 'Oracle tablespace used size', systemType: 'oracle', category: 'capacity', unit: 'MB', warnThreshold: null, critThreshold: null, direction: 'high', description: 'Parsed tablespace used size in MB' },
  { metricId: 'oracle.tablespace.free_mb', name: 'Oracle tablespace free size', systemType: 'oracle', category: 'capacity', unit: 'MB', warnThreshold: null, critThreshold: null, direction: 'low', description: 'Parsed tablespace free size in MB' },
  { metricId: 'oracle.sga.buffer_cache_hit_ratio', name: 'Oracle buffer cache hit ratio', systemType: 'oracle', category: 'performance', unit: '%', warnThreshold: 95, critThreshold: 90, direction: 'low', description: 'Parsed SGA buffer cache hit ratio' },
  { metricId: 'oracle.sga.library_cache_hit_ratio', name: 'Oracle library cache hit ratio', systemType: 'oracle', category: 'performance', unit: '%', warnThreshold: 95, critThreshold: 90, direction: 'low', description: 'Parsed SGA library cache hit ratio' },
  { metricId: 'oracle.sga.dictionary_cache_hit_ratio', name: 'Oracle dictionary cache hit ratio', systemType: 'oracle', category: 'performance', unit: '%', warnThreshold: 95, critThreshold: 90, direction: 'low', description: 'Parsed SGA dictionary cache hit ratio' },
  { metricId: 'oracle.sga.shared_pool_free', name: 'Oracle shared pool free', systemType: 'oracle', category: 'performance', unit: '%', warnThreshold: 10, critThreshold: 5, direction: 'low', description: 'Parsed shared pool free percent' },
  { metricId: 'oracle.db.actual_usage', name: 'Oracle database actual usage', systemType: 'oracle', category: 'capacity', unit: '%', warnThreshold: 80, critThreshold: 90, direction: 'high', description: 'Parsed database actual usage percent' },
  { metricId: 'oracle.db.total_size_gb', name: 'Oracle database total size', systemType: 'oracle', category: 'capacity', unit: 'GB', warnThreshold: null, critThreshold: null, direction: 'high', description: 'Parsed total DB size in GB' },
  { metricId: 'oracle.db.segment_size_gb', name: 'Oracle segment total size', systemType: 'oracle', category: 'capacity', unit: 'GB', warnThreshold: null, critThreshold: null, direction: 'high', description: 'Parsed total segment size in GB' },
  { metricId: 'oracle.replication.apply_gap_seq', name: 'Oracle replication apply gap', systemType: 'oracle', category: 'availability', unit: 'seq', warnThreshold: 1, critThreshold: 1000, direction: 'high', description: 'Parsed archive/apply sequence gap' },
  { metricId: 'oracle.replication.source_sequence', name: 'Oracle source log sequence', systemType: 'oracle', category: 'availability', unit: 'seq', warnThreshold: null, critThreshold: null, direction: 'high', description: 'Parsed source DB current log sequence' },
  { metricId: 'oracle.replication.applied_sequence', name: 'Oracle standby applied sequence', systemType: 'oracle', category: 'availability', unit: 'seq', warnThreshold: null, critThreshold: null, direction: 'high', description: 'Parsed standby applied sequence' },
  { metricId: 'oracle.alert.errors', name: 'Oracle alert log errors', systemType: 'oracle', category: 'availability', unit: 'count', warnThreshold: 1, critThreshold: 5, direction: 'high', description: 'Parsed recent alert log ORA count' },
  { metricId: 'oracle.alert.internal_errors', name: 'Oracle internal alert errors', systemType: 'oracle', category: 'availability', unit: 'count', warnThreshold: 1, critThreshold: 3, direction: 'high', description: 'Parsed ORA-600/7445/603 count' },
  { metricId: 'linux.disk.usage', name: 'Linux disk usage', systemType: 'linux', category: 'capacity', unit: '%', warnThreshold: 80, critThreshold: 90, direction: 'high', description: 'Parsed filesystem usage percent' },
  { metricId: 'linux.disk.total_gb', name: 'Linux disk total size', systemType: 'linux', category: 'capacity', unit: 'GB', warnThreshold: null, critThreshold: null, direction: 'high', description: 'Parsed filesystem total size in GB' },
  { metricId: 'linux.disk.used_gb', name: 'Linux disk used size', systemType: 'linux', category: 'capacity', unit: 'GB', warnThreshold: null, critThreshold: null, direction: 'high', description: 'Parsed filesystem used size in GB' },
  { metricId: 'linux.disk.avail_gb', name: 'Linux disk available size', systemType: 'linux', category: 'capacity', unit: 'GB', warnThreshold: null, critThreshold: null, direction: 'low', description: 'Parsed filesystem available size in GB' },
];

export async function ensureMetricSchema(connection: any): Promise<void> {
  for (const ddl of DDL) {
    try { await connection.execute(ddl); }
    catch (error: any) { if (!isAlreadyExists(error)) throw error; }
  }
  await seedDefaultDefinitions(connection);
}

async function seedDefaultDefinitions(connection: any): Promise<void> {
  const mergeSql = `
    MERGE INTO METRIC_DEFINITIONS d
    USING (SELECT :metricId AS metric_id FROM DUAL) src
    ON (d.METRIC_ID = src.metric_id)
    WHEN MATCHED THEN UPDATE SET
      NAME=:name,
      SYSTEM_TYPE=:systemType,
      CATEGORY=:category,
      UNIT=:unit,
      WARN_THRESHOLD=:warnThreshold,
      CRIT_THRESHOLD=:critThreshold,
      DIRECTION=:direction,
      DESCRIPTION=:description,
      ENABLED=1
    WHEN NOT MATCHED THEN INSERT
      (METRIC_ID, NAME, SYSTEM_TYPE, CATEGORY, UNIT, WARN_THRESHOLD, CRIT_THRESHOLD, DIRECTION, DESCRIPTION, ENABLED)
    VALUES
      (:metricId, :name, :systemType, :category, :unit, :warnThreshold, :critThreshold, :direction, :description, 1)
  `;
  for (const def of DEFAULT_DEFINITIONS) {
    await connection.execute(mergeSql, def);
  }
}
