/**
 * 파일: backend/src/modules/knowledge-base/schema/kbProductSchema.ts
 * 역할: KB_PRODUCTS(제품 카탈로그) + KB_PRODUCT_VERSIONS(버전 카탈로그) DDL + 시드 데이터.
 *       ensureKbProductSchema → server.ts에서 ensureKbSchema 직후 호출.
 */

import { isAlreadyExists } from '../../../infra/oracle/errorCodes.js';

const DDL = [
  `CREATE TABLE KB_PRODUCTS (
    PRODUCT_ID   VARCHAR2(40 CHAR)   NOT NULL,
    CANONICAL    VARCHAR2(200 CHAR)  NOT NULL,
    DISPLAY_NAME VARCHAR2(200 CHAR),
    VENDOR       VARCHAR2(100 CHAR),
    CATEGORY     VARCHAR2(50 CHAR)   DEFAULT 'other' NOT NULL,
    ACTIVE_FLAG  NUMBER(1)           DEFAULT 1 NOT NULL,
    CREATED_AT   TIMESTAMP           DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_KB_PRODUCTS   PRIMARY KEY (PRODUCT_ID),
    CONSTRAINT UQ_KB_PROD_NAME  UNIQUE (CANONICAL)
  )`,
  `CREATE INDEX IDX_KBP_VENDOR ON KB_PRODUCTS (VENDOR, ACTIVE_FLAG)`,
  `CREATE TABLE KB_PRODUCT_VERSIONS (
    VERSION_ID   VARCHAR2(40 CHAR)  NOT NULL,
    PRODUCT_ID   VARCHAR2(40 CHAR)  NOT NULL,
    VERSION_TAG  VARCHAR2(50 CHAR)  NOT NULL,
    VERSION_NUM  NUMBER             NOT NULL,
    EOL_DATE     DATE,
    ACTIVE_FLAG  NUMBER(1)          DEFAULT 1 NOT NULL,
    CONSTRAINT PK_KB_PROD_VER  PRIMARY KEY (VERSION_ID),
    CONSTRAINT FK_KPV_PRODUCT  FOREIGN KEY (PRODUCT_ID) REFERENCES KB_PRODUCTS(PRODUCT_ID) ON DELETE CASCADE,
    CONSTRAINT UQ_KPV_TAG      UNIQUE (PRODUCT_ID, VERSION_TAG)
  )`,
  `CREATE INDEX IDX_KPV_PRODUCT ON KB_PRODUCT_VERSIONS (PRODUCT_ID, VERSION_NUM)`,
];

// KB_DOCUMENTS 에 제품 FK + 버전 범위 숫자 컬럼 추가
const ALTER_KB_DOCUMENTS = [
  `ALTER TABLE KB_DOCUMENTS ADD (PRODUCT_ID VARCHAR2(40 CHAR))`,
  `ALTER TABLE KB_DOCUMENTS ADD (VERSION_MIN_NUM NUMBER)`,
  `ALTER TABLE KB_DOCUMENTS ADD (VERSION_MAX_NUM NUMBER)`,
  `ALTER TABLE KB_DOCUMENTS ADD (FRESHNESS_DATE DATE)`,
  `ALTER TABLE KB_DOCUMENTS ADD (IS_DEPRECATED NUMBER(1) DEFAULT 0)`,
];

type SeedVersion = { tag: string; num: number; eol?: string };
type SeedProduct = { id: string; canonical: string; vendor: string; category: string; versions: SeedVersion[] };

const SEED: SeedProduct[] = [
  {
    id: 'prod-oradb', canonical: 'Oracle Database', vendor: 'Oracle', category: 'db',
    versions: [
      { tag: '11g', num: 110 }, { tag: '12c', num: 120 }, { tag: '18c', num: 180 },
      { tag: '19c', num: 190 }, { tag: '21c', num: 210 }, { tag: '23ai', num: 230 },
      { tag: '26ai', num: 260 },
    ],
  },
  {
    id: 'prod-orarac', canonical: 'Oracle RAC', vendor: 'Oracle', category: 'db',
    versions: [{ tag: '19c', num: 190 }, { tag: '21c', num: 210 }, { tag: '23ai', num: 230 }],
  },
  {
    id: 'prod-oragg', canonical: 'Oracle GoldenGate', vendor: 'Oracle', category: 'middleware',
    versions: [{ tag: '19c', num: 190 }, { tag: '21c', num: 210 }, { tag: '23ai', num: 230 }],
  },
  {
    id: 'prod-exadata', canonical: 'Oracle Exadata', vendor: 'Oracle', category: 'infrastructure',
    versions: [{ tag: 'X7', num: 70 }, { tag: 'X8', num: 80 }, { tag: 'X9', num: 90 }, { tag: 'X10M', num: 100 }],
  },
  {
    id: 'prod-weblogic', canonical: 'Oracle WebLogic', vendor: 'Oracle', category: 'middleware',
    versions: [{ tag: '12.2', num: 122 }, { tag: '14.1', num: 141 }],
  },
  {
    id: 'prod-rhel', canonical: 'RHEL', vendor: 'Red Hat', category: 'os',
    versions: [{ tag: '7', num: 70 }, { tag: '8', num: 80 }, { tag: '9', num: 90 }],
  },
  {
    id: 'prod-winsvr', canonical: 'Windows Server', vendor: 'Microsoft', category: 'os',
    versions: [{ tag: '2016', num: 20160 }, { tag: '2019', num: 20190 }, { tag: '2022', num: 20220 }],
  },
  {
    id: 'prod-aix', canonical: 'AIX', vendor: 'IBM', category: 'os',
    versions: [{ tag: '7.1', num: 71 }, { tag: '7.2', num: 72 }, { tag: '7.3', num: 73 }],
  },
  {
    id: 'prod-tomcat', canonical: 'Apache Tomcat', vendor: 'Apache', category: 'middleware',
    versions: [{ tag: '8.5', num: 85 }, { tag: '9.0', num: 90 }, { tag: '10.1', num: 101 }],
  },
  {
    id: 'prod-jboss', canonical: 'JBoss EAP', vendor: 'Red Hat', category: 'middleware',
    versions: [{ tag: '7.3', num: 73 }, { tag: '7.4', num: 74 }],
  },
  {
    id: 'prod-nginx', canonical: 'Nginx', vendor: 'F5', category: 'middleware',
    versions: [{ tag: '1.22', num: 122 }, { tag: '1.24', num: 124 }, { tag: '1.26', num: 126 }],
  },
  {
    id: 'prod-tibero', canonical: 'Tibero', vendor: 'TmaxSoft', category: 'db',
    versions: [{ tag: '6.0', num: 60 }, { tag: '7.0', num: 70 }],
  },
  {
    id: 'prod-mysql', canonical: 'MySQL', vendor: 'Oracle', category: 'db',
    versions: [{ tag: '5.7', num: 57 }, { tag: '8.0', num: 80 }, { tag: '8.4', num: 84 }],
  },
  {
    id: 'prod-pgsql', canonical: 'PostgreSQL', vendor: 'PostgreSQL', category: 'db',
    versions: [{ tag: '13', num: 130 }, { tag: '14', num: 140 }, { tag: '15', num: 150 }, { tag: '16', num: 160 }],
  },
  {
    id: 'prod-altibase', canonical: 'Altibase HDB', vendor: 'Altibase', category: 'db',
    versions: [{ tag: '7.1', num: 71 }, { tag: '7.3', num: 73 }],
  },
  {
    id: 'prod-cubrid', canonical: 'CUBRID', vendor: 'CUBRID', category: 'db',
    versions: [{ tag: '10.2', num: 102 }, { tag: '11.0', num: 110 }, { tag: '11.3', num: 113 }],
  },
];

async function seedProductsIfEmpty(connection): Promise<void> {
  const check = await connection.execute(
    `SELECT COUNT(*) AS CNT FROM KB_PRODUCTS`,
    [],
    { outFormat: 4002 },
  );
  const cnt = (check.rows[0] as any)?.CNT ?? 0;
  if (cnt > 0) return;

  for (const p of SEED) {
    await connection.execute(
      `INSERT INTO KB_PRODUCTS (PRODUCT_ID, CANONICAL, DISPLAY_NAME, VENDOR, CATEGORY) VALUES (:id, :canonical, :display, :vendor, :category)`,
      { id: p.id, canonical: p.canonical, display: p.canonical, vendor: p.vendor, category: p.category },
    );
    for (const v of p.versions) {
      await connection.execute(
        `INSERT INTO KB_PRODUCT_VERSIONS (VERSION_ID, PRODUCT_ID, VERSION_TAG, VERSION_NUM, EOL_DATE)
         VALUES ('ver-' || :pid || '-' || :tag, :pid, :tag, :num, NULL)`,
        { pid: p.id, tag: v.tag, num: v.num },
      );
    }
  }
}

async function ensureSeedVersions(connection): Promise<void> {
  for (const p of SEED) {
    for (const v of p.versions) {
      await connection.execute(
        `INSERT INTO KB_PRODUCT_VERSIONS (VERSION_ID, PRODUCT_ID, VERSION_TAG, VERSION_NUM, EOL_DATE)
         SELECT :id, :pid, :tag, :num, NULL
         FROM dual
         WHERE EXISTS (SELECT 1 FROM KB_PRODUCTS WHERE PRODUCT_ID = :pid)
           AND NOT EXISTS (
             SELECT 1
             FROM KB_PRODUCT_VERSIONS
             WHERE PRODUCT_ID = :pid AND VERSION_TAG = :tag
           )`,
        {
          id: `ver-${p.id}-${v.tag}`,
          pid: p.id,
          tag: v.tag,
          num: v.num,
        },
      );
    }
  }
}

export async function ensureKbProductSchema(connection): Promise<void> {
  for (const ddl of DDL) {
    try { await connection.execute(ddl); }
    catch (err) { if (!isAlreadyExists(err)) throw err; }
  }
  for (const ddl of ALTER_KB_DOCUMENTS) {
    try { await connection.execute(ddl); }
    catch (err: any) {
      if (err.errorNum !== 1430 && !isAlreadyExists(err)) throw err;
    }
  }
  await seedProductsIfEmpty(connection);
  await ensureSeedVersions(connection);
}
