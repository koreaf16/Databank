# Stage 2 — 트렌드 일반화 (범용 시계열 메트릭)

## 1. 단계 개요

현재 `ChannelTrend.tsx` 는 Oracle 전용 capacity kind(tablespace, db_file, archive_log…)와 hardcoded 임계값(warn 80, crit 90)으로 가짜 observations를 만들고 있다. 388번 줄에 직접 적힌 코멘트: *"실 운영 환경에서는 API에서 observations를 가져오겠지만, 현재는 monthly 데이터를 기반으로 가상 observations를 생성"*.

이 단계는 그 한정된 구조를 **범용 시계열 메트릭 시스템**으로 일반화한다. Oracle뿐 아니라 WebLogic, MySQL, PostgreSQL, MariaDB, Redis, MongoDB, Linux/Windows 서버, AWS/Azure 클라우드 자원, 보안장비 어떤 시스템이든 같은 스키마로 용량·성능 메트릭을 기록·조회한다.

**산출물**: 4-테이블 메트릭 모델 + metrics 모듈 + 시드 메트릭 정의 + Ingest API + ChannelTrend UI 일반화.

UI 디자인은 그대로 유지한다. KPI 카드, Top 10 위험, 차트, 히트맵, 상세표 — 전부 같은 모양. 시스템 종류 필터만 신설.

---

## 2. 모델 결정 사유

### 왜 시계열 분리?

기존 구조처럼 capacity 항목을 한 행씩 직접 보관하면 (`obs_id, kind, used, total, observed_at`) 데이터량이 폭발한다. 100개 시스템 × 5메트릭 × 5분 간격 = 144,000건/일. 12개월이면 5천만 건. 인덱스 없이는 조회가 무너진다.

해결: **메타(정의 · 대상)와 사실(샘플)을 분리**하고 사실 테이블은 RANGE 파티션. 조회는 항상 (target_id, time range) 기준이라 (target_id, collected_at) 인덱스로 빠름.

### 왜 `system_type` 컬럼?

Oracle / MySQL / Redis 등 시스템 종류별로 메트릭이 다르다 (테이블스페이스 vs InnoDB Buffer vs Redis Memory). 같은 메트릭도 단위가 다르다 (TS는 %, TPS는 count/sec). 이걸 하나의 평면 테이블에 담으려면 시스템 종류와 메트릭 종류를 분리해야 한다.

`METRIC_DEFINITIONS.system_type` 으로 시스템별 메트릭 카탈로그 관리. UI 시스템 종류 필터가 이 컬럼으로 분기.

### 왜 임계값 오버라이드 분리?

기본 임계값은 메트릭 정의에 들어간다 (예: 디스크 사용률 warn 80, crit 90). 하지만 고객사마다 운영 정책이 다르다. A사는 70/85, B사는 85/95. 이걸 정의 테이블에 다 펼치면 정의가 폭발한다.

해결: `TARGET_METRIC_OVERRIDES` 별도 테이블. 기본은 정의, 오버라이드 있으면 우선.

### 왜 dept_id, NUMBER FK?

기존 스키마와 일관 — `CUSTOMERS.CUSTOMER_ID`, `DEPARTMENTS.DEPT_ID`, `USERS.USER_ID` 모두 `NUMBER`. 별도 `TEAMS` 테이블이 없으므로 모니터링 대상 담당 조직은 `dept_id` 로 둔다. 서비스 마스터 PK는 `SERVICE_MASTERS.MASTER_ID VARCHAR2(100 CHAR)` 이므로 그대로 FK.

`enabled` / `is_default` 같은 플래그는 기존 패턴(`SERVICE_MASTERS.ENABLED NUMBER(1) DEFAULT 1`, `AI_MODELS.IS_DEFAULT NUMBER(1) DEFAULT 0`)을 따른다.

---

## 3. DDL

`backend/src/scripts/initMetricSchema.ts` 신규. 기존 `initOrgCustomerSchema.ts`, `initReportTemplateSchema.ts` 패턴 그대로.

### 3.1 METRIC_DEFINITIONS — 메트릭 정의

```sql
CREATE TABLE METRIC_DEFINITIONS (
  metric_id          VARCHAR2(64 CHAR)  NOT NULL,
  name               VARCHAR2(200 CHAR) NOT NULL,
  system_type        VARCHAR2(40 CHAR)  NOT NULL,  -- oracle | mysql | postgres | mariadb
                                                   -- redis | mongodb | weblogic | tomcat
                                                   -- linux | windows | aws_rds | aws_ec2
                                                   -- azure_sql | security
  category           VARCHAR2(40 CHAR)  NOT NULL,  -- capacity | performance | availability
  unit               VARCHAR2(20 CHAR)  NOT NULL,  -- %, GB, MB, ms, count, tps
  warn_threshold     NUMBER,
  crit_threshold     NUMBER,
  direction          VARCHAR2(8 CHAR)   DEFAULT 'high' NOT NULL,  -- high | low(낮을수록 위험)
  description        VARCHAR2(500 CHAR),
  enabled            NUMBER(1)          DEFAULT 1 NOT NULL,
  created_at         TIMESTAMP          DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_metric_definitions PRIMARY KEY (metric_id)
);

CREATE INDEX idx_metric_def_systype ON METRIC_DEFINITIONS(system_type, enabled);
```

### 3.2 MONITOR_TARGETS — 모니터링 대상

```sql
CREATE TABLE MONITOR_TARGETS (
  target_id          NUMBER             GENERATED ALWAYS AS IDENTITY,
  name               VARCHAR2(200 CHAR) NOT NULL,
  system_type        VARCHAR2(40 CHAR)  NOT NULL,
  customer_id        NUMBER,                                -- FK CUSTOMERS
  dept_id            NUMBER,                                -- FK DEPARTMENTS (담당 부서/팀)
  service_master_id  VARCHAR2(100 CHAR),                    -- FK SERVICE_MASTERS
  hostname           VARCHAR2(200 CHAR),
  endpoint           VARCHAR2(500 CHAR),                    -- agent 식별용
  status             VARCHAR2(20 CHAR)  DEFAULT 'active' NOT NULL,  -- active | paused | retired
  description        VARCHAR2(500 CHAR),
  created_by         NUMBER,                                -- FK USERS
  created_at         TIMESTAMP          DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at         TIMESTAMP,
  CONSTRAINT pk_monitor_targets PRIMARY KEY (target_id),
  CONSTRAINT fk_target_customer FOREIGN KEY (customer_id)       REFERENCES CUSTOMERS(customer_id),
  CONSTRAINT fk_target_dept     FOREIGN KEY (dept_id)           REFERENCES DEPARTMENTS(dept_id),
  CONSTRAINT fk_target_service  FOREIGN KEY (service_master_id) REFERENCES SERVICE_MASTERS(master_id),
  CONSTRAINT fk_target_creator  FOREIGN KEY (created_by)        REFERENCES USERS(user_id)
);

CREATE INDEX idx_target_customer ON MONITOR_TARGETS(customer_id, status);
CREATE INDEX idx_target_systype  ON MONITOR_TARGETS(system_type, status);
CREATE INDEX idx_target_dept     ON MONITOR_TARGETS(dept_id, status);
```

### 3.3 METRIC_SAMPLES — 시계열 샘플 (RANGE INTERVAL 파티션)

```sql
CREATE TABLE METRIC_SAMPLES (
  sample_id          NUMBER             GENERATED ALWAYS AS IDENTITY,
  target_id          NUMBER             NOT NULL,
  metric_id          VARCHAR2(64 CHAR)  NOT NULL,
  collected_at       TIMESTAMP          NOT NULL,
  value              NUMBER             NOT NULL,
  status             VARCHAR2(8 CHAR)   NOT NULL,   -- ok | warn | crit
  source             VARCHAR2(20 CHAR)  NOT NULL,   -- agent | manual | report-parse
  source_ref         VARCHAR2(200 CHAR),            -- 보고서 ID 등 근거
  CONSTRAINT pk_metric_samples PRIMARY KEY (sample_id, collected_at)
)
PARTITION BY RANGE (collected_at)
INTERVAL (NUMTOYMINTERVAL(1, 'MONTH'))
(
  PARTITION p_init VALUES LESS THAN (TO_DATE('2026-01-01', 'YYYY-MM-DD'))
);

CREATE INDEX idx_samples_target_time
  ON METRIC_SAMPLES(target_id, collected_at DESC) LOCAL;
CREATE INDEX idx_samples_metric_time
  ON METRIC_SAMPLES(metric_id, collected_at) LOCAL;
```

`INTERVAL` 파티셔닝으로 월이 바뀌면 자동 신규 파티션 생성. 12개월 이상 된 파티션은 후속 작업에서 월별 집계 테이블로 이관(아래 3.5 참고).

`target_id` / `metric_id` 의 FK 제약은 partition 테이블의 운영 부담을 고려해 응용 레벨(Ingest 트랜잭션)에서 검증한다.

### 3.4 TARGET_METRIC_OVERRIDES — 임계값 오버라이드

```sql
CREATE TABLE TARGET_METRIC_OVERRIDES (
  target_id          NUMBER             NOT NULL,
  metric_id          VARCHAR2(64 CHAR)  NOT NULL,
  warn_threshold     NUMBER,
  crit_threshold     NUMBER,
  reason             VARCHAR2(500 CHAR),
  updated_by         NUMBER,
  updated_at         TIMESTAMP          DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_target_metric_override PRIMARY KEY (target_id, metric_id),
  CONSTRAINT fk_override_target FOREIGN KEY (target_id) REFERENCES MONITOR_TARGETS(target_id),
  CONSTRAINT fk_override_metric FOREIGN KEY (metric_id) REFERENCES METRIC_DEFINITIONS(metric_id)
);
```

### 3.5 (Stage 2-2 선택) METRIC_AGGREGATES — 월별 집계

12개월 이상 데이터를 raw에서 월별 평균/최대/최소로 옮길 테이블. **Stage 2 본 작업에서는 필수 생성 대상이 아니다.** Stage 2-2 선택 산출물.

```sql
CREATE TABLE METRIC_AGGREGATES (
  target_id     NUMBER,
  metric_id     VARCHAR2(64 CHAR),
  bucket_month  DATE,
  avg_value     NUMBER,
  max_value     NUMBER,
  min_value     NUMBER,
  sample_count  NUMBER,
  worst_status  VARCHAR2(8 CHAR),
  CONSTRAINT pk_metric_agg PRIMARY KEY (target_id, metric_id, bucket_month)
);
```

---

## 4. 시드 메트릭 정의

`backend/src/scripts/seedMetricDefinitions.ts` 신규. 시스템 종류별 기본 메트릭 카탈로그 ~50개.

### 4.1 Oracle (system_type = 'oracle')

| metric_id | 이름 | unit | warn | crit | direction |
|---|---|---|---|---|---|
| oracle.tablespace.usage | 테이블스페이스 사용률 | % | 80 | 90 | high |
| oracle.archive.usage | ARCHIVE 영역 사용률 | % | 75 | 90 | high |
| oracle.asm.usage | ASM 디스크 그룹 사용률 | % | 80 | 90 | high |
| oracle.sga.hit_ratio | SGA Buffer Hit Ratio | % | 95 | 90 | low |
| oracle.session.long_active | Long Active Sessions | count | 5 | 10 | high |
| oracle.dbtime.percent | DB Time % | % | 70 | 90 | high |

### 4.2 MySQL/MariaDB (system_type = 'mysql', 'mariadb')

| metric_id | 이름 | unit | warn | crit | direction |
|---|---|---|---|---|---|
| mysql.datadir.usage | 데이터 디렉토리 사용률 | % | 80 | 90 | high |
| mysql.innodb_buffer.hit_ratio | InnoDB Buffer Pool Hit Ratio | % | 95 | 90 | low |
| mysql.slowquery.per_min | 슬로우 쿼리/분 | count | 10 | 50 | high |
| mysql.connections.percent | 최대 커넥션 사용률 | % | 70 | 90 | high |
| mysql.replication.lag_sec | 복제 지연 | sec | 5 | 30 | high |

### 4.3 PostgreSQL (system_type = 'postgres')

| metric_id | 이름 | unit | direction |
|---|---|---|---|
| postgres.tablespace.usage | 테이블스페이스 사용률 | % | high |
| postgres.cache.hit_ratio | 캐시 히트율 | % | low |
| postgres.connection.percent | 커넥션 사용률 | % | high |
| postgres.deadlock.per_hour | 데드락/시간 | count | high |

### 4.4 Redis (system_type = 'redis')

| metric_id | 이름 | unit | direction |
|---|---|---|---|
| redis.memory.usage | 메모리 사용률 | % | high |
| redis.eviction.per_sec | 키 evict/초 | count | high |
| redis.keyspace.hit_ratio | Keyspace Hit Ratio | % | low |
| redis.connected_clients | 연결 클라이언트 수 | count | high |

### 4.5 MongoDB (system_type = 'mongodb')

| metric_id | 이름 | unit | direction |
|---|---|---|---|
| mongodb.storage.usage | 스토리지 사용률 | % | high |
| mongodb.connection.percent | 커넥션 사용률 | % | high |
| mongodb.replication.lag_sec | 복제 지연 | sec | high |

### 4.6 Linux 서버 (system_type = 'linux')

| metric_id | 이름 | unit | direction |
|---|---|---|---|
| linux.disk.root_usage | / 디스크 사용률 | % | high |
| linux.disk.var_usage | /var 디스크 사용률 | % | high |
| linux.cpu.load_avg_5m | CPU Load Average (5분) | count | high |
| linux.memory.usage | 메모리 사용률 | % | high |
| linux.swap.usage | 스왑 사용률 | % | high |

### 4.7 Windows 서버 (system_type = 'windows')

| metric_id | 이름 | unit | direction |
|---|---|---|---|
| windows.disk.c_usage | C: 디스크 사용률 | % | high |
| windows.cpu.usage | CPU 사용률 | % | high |
| windows.memory.usage | 메모리 사용률 | % | high |

### 4.8 WebLogic (system_type = 'weblogic')

| metric_id | 이름 | unit | direction |
|---|---|---|---|
| weblogic.heap.usage | JVM Heap 사용률 | % | high |
| weblogic.thread.stuck | Stuck Threads | count | high |
| weblogic.jdbc.pool_usage | JDBC 풀 사용률 | % | high |

### 4.9 AWS RDS / EC2 (system_type = 'aws_rds', 'aws_ec2')

| metric_id | 이름 | unit | direction |
|---|---|---|---|
| aws_rds.storage.free_gb | 남은 스토리지 | GB | low |
| aws_rds.cpu.percent | CPU 사용률 | % | high |
| aws_rds.connections | 커넥션 수 | count | high |
| aws_ec2.cpu.percent | CPU 사용률 | % | high |
| aws_ec2.disk.usage | 디스크 사용률 | % | high |

### 4.10 보안장비 (system_type = 'security')

| metric_id | 이름 | unit | direction |
|---|---|---|---|
| security.session.percent | 세션 사용률 | % | high |
| security.cpu.percent | CPU 사용률 | % | high |
| security.policy.match_per_sec | 정책 매칭/초 | count | high |

운영 시 `Settings` 화면에서 추가/수정 가능.

---

## 5. 백엔드 모듈 (신규)

`backend/src/modules/metrics/` — 다른 모듈과 동일 구조 (schema/repository/routes/services/validators).

### 5.1 라우트

| 메서드 | 경로 | 용도 | 권한 |
|---|---|---|---|
| GET | `/api/metrics/definitions?systemType=` | 메트릭 정의 목록 | 모든 사용자 |
| POST | `/api/metrics/definitions` | 정의 추가 | 관리자 |
| PUT | `/api/metrics/definitions/:metricId` | 정의 수정 | 관리자 |
| DELETE | `/api/metrics/definitions/:metricId` | soft 삭제 (enabled=0) | 관리자 |
| GET | `/api/metrics/targets?customerId=&systemType=&status=` | 대상 목록 | 권한별 필터 |
| POST | `/api/metrics/targets` | 대상 추가 | 부서장 이상 |
| PUT/DELETE | `/api/metrics/targets/:targetId` | 대상 수정/삭제 | 부서장 이상 |
| GET | `/api/metrics/samples?targetId=&metricId=&from=&to=&agg=raw\|hour\|day\|month` | 시계열 조회 | 본인 담당만 |
| POST | `/api/metrics/manual` | 수동 입력 | 엔지니어 |
| POST | `/api/metrics/ingest` | Agent push (배치) | 토큰 인증 |
| GET | `/api/metrics/risk?customerId=` | 위험 Top N | 본인 담당만 |
| PUT | `/api/metrics/overrides/:targetId/:metricId` | 임계값 오버라이드 | 부서장 이상 |

### 5.2 서비스 로직 핵심

**Ingest 트랜잭션 (`metrics/services/ingest.ts`)**

```
withTransaction:
  for each sample {
    1. 메트릭 정의에서 warn/crit 조회 (캐시 60초)
    2. TARGET_METRIC_OVERRIDES 조회 (있으면 우선)
    3. status 결정:
       direction='high' && value >= crit → crit
       direction='high' && value >= warn → warn
       direction='low'  && value <= crit → crit
       direction='low'  && value <= warn → warn
       그 외 → ok
    4. METRIC_SAMPLES insert
  }
  audit log: 1건 (배치 단위)
```

**Risk 조회 (`metrics/services/risk.ts`)**

```sql
WITH latest AS (
  SELECT s.target_id, s.metric_id, s.value, s.status, s.collected_at,
         ROW_NUMBER() OVER (
           PARTITION BY s.target_id, s.metric_id ORDER BY s.collected_at DESC
         ) rn
  FROM METRIC_SAMPLES s
  WHERE s.collected_at >= SYSTIMESTAMP - INTERVAL '7' DAY
)
SELECT t.name AS target_name, t.system_type, t.customer_id,
       d.name AS metric_name, d.unit, d.direction,
       l.value, l.status, l.collected_at
FROM latest l
JOIN MONITOR_TARGETS    t ON t.target_id = l.target_id
JOIN METRIC_DEFINITIONS d ON d.metric_id = l.metric_id
WHERE l.rn = 1
  AND l.status IN ('warn', 'crit')
  AND (:customerId IS NULL OR t.customer_id = :customerId)
ORDER BY DECODE(l.status, 'crit', 1, 'warn', 2, 3),
         l.value DESC
FETCH FIRST 50 ROWS ONLY
```

**Ingest 토큰**: 초기에는 env 변수(`METRIC_INGEST_TOKEN`)로 시작. 운영 단계에서 다중 Agent 별 토큰이 필요하면 `INGEST_TOKENS` 테이블 신규(별도 작업). `AI_PROVIDERS` 같은 LLM 자격증명 테이블에는 넣지 않는다.

---

## 6. 프론트엔드 마이그레이션

### 6.1 ChannelTrend.tsx 변경

| 위치 | 현재 | 변경 |
|---|---|---|
| props | `services` (window 의존) | `customerId` (또는 `services` 유지하되 내부에서 fetch) |
| 388-421번 줄 `buildCapacityObservations` | service.monthly로 가짜 obs 생성 | 제거. `useMetricsRisk(customerId)` + `useMetricsSamples(targetId, metricId)` |
| `CAPACITY_KIND_LABELS`, `CAPACITY_KIND_SHORT` (9-31번 줄) | hardcoded | `useMetricsDefinitions()` 응답으로 동적 구성. fallback으로 hardcoded 유지 |
| `CAPACITY_KIND_ORDER` (33번 줄) | Oracle 우선 | system_type 별 order |
| 35-36번 줄 `window.TEAMS`, `window.FREQ_BY_ID` | 전역 | MasterDataContext (Stage 1 산출물) |
| KPI 카드, Top 10, 차트, 히트맵, 상세표 | 그대로 | **JSX 100% 보존** — 데이터 출처만 교체 |

### 6.2 신규: 시스템 종류 필터

기존 `kindFilter` 위에 시스템 종류 탭 추가. 기존 `capacity-kind-tabs` 클래스 그대로 사용해 동일 디자인.

```
[전체] [Oracle (12)] [MySQL (3)] [Redis (2)] [Linux 서버 (8)] [AWS (4)]
```

`metric_definitions` 의 distinct system_type. 각 탭 옆 숫자는 `monitor_targets` 카운트.

### 6.3 신규: 수동 입력 화면

엔지니어가 정기점검 직후 직접 입력할 수 있는 입력 폼. `frontend/src/features/metrics/components/ManualEntryModal.tsx` 신규.

- 대상 선택 (combobox)
- 메트릭 선택 (대상의 system_type 으로 필터된 정의 목록)
- 값 입력
- 측정 시각 (기본 now)
- 출처 메모 (보고서 ID 자동 채움)

`POST /api/metrics/manual` 호출.

### 6.4 신규: 대상 관리 화면

`frontend/src/features/metrics/components/MonitorTargetsPage.tsx`. 관리설정 메뉴 안에 신규 탭으로 추가.

- 고객사·시스템 종류별 대상 목록
- 추가/수정/삭제
- 임계값 오버라이드 편집

기존 Settings 탭 디자인 그대로 재사용.

### 6.5 미사용 파일 제거

`frontend/src/components/ChannelTrend.tsx` (27KB v2, 미사용) 삭제.

### 6.6 500줄 한도 대응

현 `ChannelTrend.tsx` 476줄 + 시스템 종류 필터 추가 = 한도 초과 가능. 다음 분리:

```
frontend/src/features/messaging/parts/ChannelTrend.tsx   (메인, ~250줄)
frontend/src/features/messaging/parts/trend/
  CapacityTrendChart.tsx                                 (SVG 차트, ~80줄)
  CapacityKpi.tsx                                        (KPI 카드, ~30줄)
  CapacityHeatmap.tsx                                    (히트맵, ~70줄)
  CapacityDetailTable.tsx                                (상세표, ~80줄)
  helpers.ts                                             (capacityTone 등, ~50줄)
```

JSX/CSS 원본 그대로 분리. 인라인 스타일도 그대로.

---

## 7. 작업 순서

1. **DDL 작성** — `initMetricSchema.ts` 작성, `backend/package.json` 에 `init:metric-schema` 스크립트 추가 후 실행
2. **시드** — `seedMetricDefinitions.ts` 작성, ~50개 메트릭 정의 등록
3. **백엔드 모듈 골격** — `modules/metrics/` 디렉토리, schema/repository/routes 추가
4. **수동 입력 + 조회 API 우선** — `/manual`, `/samples`, `/risk`
5. **수동 입력 화면 + 대상 관리 화면** — 데이터를 일단 채울 수 있게
6. **Ingest API + Agent 가이드 문서** — Agent push 모의 호출 테스트 (env 토큰)
7. **ChannelTrend 분할 + 데이터 소스 교체** — JSX 보존하며 props/fetch만 교체
8. **시스템 종류 필터 추가**
9. **미사용 ChannelTrend.tsx (v2) 삭제**

---

## 8. 검증 (이 단계만)

| 검증 | 방법 |
|---|---|
| 필수 4테이블 생성 | `METRIC_DEFINITIONS`, `MONITOR_TARGETS`, `METRIC_SAMPLES`, `TARGET_METRIC_OVERRIDES` 확인 |
| 선택 집계 테이블 | Stage 2-2까지 포함할 경우 `METRIC_AGGREGATES` 추가 |
| 시드 메트릭 | `SELECT COUNT(*) FROM METRIC_DEFINITIONS WHERE enabled=1` → 50+ |
| Manual 입력 | UI에서 1개 대상에 12개월치 12행 입력 → ChannelTrend 라인차트 정상 표시 |
| Ingest 배치 | curl로 1000건 배치 → 초기 목표 3초 이내 200 응답, 이후 1초 목표로 최적화 |
| 시스템 종류 필터 | MySQL 탭 클릭 → Oracle 메트릭 사라짐, MySQL 메트릭만 |
| 임계값 오버라이드 | 특정 고객사 USER_DATA TS 임계값 70/85로 낮춤 → 그 고객사만 다른 색깔 |
| 파티션 자동 생성 | 다음 달 데이터 넣기 → INTERVAL 파티션 자동 추가 (`USER_TAB_PARTITIONS`) |
| UI 디자인 회귀 | 기존 트렌드 화면과 스크린샷 비교 → 차이 0건 |

자세한 시나리오는 [99-verification.md](99-verification.md).

---

## 9. 의존성 / 위험 요소

- **Stage 1 선행 필수** — UserContext, MasterDataContext 가 있어야 트렌드 화면이 customerId 필터링 가능
- **파티션 운영 부담** — INTERVAL 파티션은 Oracle 11g+ 자동이지만, 주기적인 파티션 prune 모니터링 필요. runbook에 추가
- **Agent 토큰 관리** — `/ingest` 엔드포인트는 env 토큰으로 시작. 다중 Agent 시 별도 `INGEST_TOKENS` 설계
- **메트릭 정의 변경 영향** — 단위 / 임계값 사후 변경 시 트렌드 화면이 어색해질 수 있음. 정의 변경은 audit 필수
- **대량 ingest 성능** — 100 대상 × 5 메트릭 × 5분 = 144,000건/일. LOCAL 인덱스 + audit 1건/배치 필수
- **UI 한도 위반 위험** — ChannelTrend 분할 시 props drilling 주의. 차트는 observation 객체 통째로 전달

---

## 10. 다음 단계

이 단계 완료 후 → [03-stage3-ai-integration.md](03-stage3-ai-integration.md) 로 진행.
