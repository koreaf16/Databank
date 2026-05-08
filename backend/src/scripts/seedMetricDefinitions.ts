/**
 * 파일: backend/src/scripts/seedMetricDefinitions.ts
 * 역할: METRIC_DEFINITIONS ~50개 기본 시드 데이터 등록.
 *       npm run seed:metric-definitions 으로 실행.
 */
import 'dotenv/config';
import { closeOraclePool, getOracleConnectString } from '../infra/oracle/pool.js';
import { withOracleConnection } from '../infra/oracle/withConnection.js';

interface MetricDef {
  metricId: string;
  name: string;
  systemType: string;
  category: string;
  unit: string;
  warnThreshold: number | null;
  critThreshold: number | null;
  direction: 'high' | 'low';
  description?: string;
}

const DEFINITIONS: MetricDef[] = [
  // Oracle
  { metricId: 'oracle.tablespace.usage',    name: '테이블스페이스 사용률',     systemType: 'oracle',  category: 'capacity',     unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'oracle.archive.usage',       name: 'ARCHIVE 영역 사용률',       systemType: 'oracle',  category: 'capacity',     unit: '%',     warnThreshold: 75,   critThreshold: 90,  direction: 'high' },
  { metricId: 'oracle.asm.usage',           name: 'ASM 디스크 그룹 사용률',    systemType: 'oracle',  category: 'capacity',     unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'oracle.sga.hit_ratio',       name: 'SGA Buffer Hit Ratio',      systemType: 'oracle',  category: 'performance',  unit: '%',     warnThreshold: 95,   critThreshold: 90,  direction: 'low' },
  { metricId: 'oracle.session.long_active', name: 'Long Active Sessions',      systemType: 'oracle',  category: 'performance',  unit: 'count', warnThreshold: 5,    critThreshold: 10,  direction: 'high' },
  { metricId: 'oracle.dbtime.percent',      name: 'DB Time %',                 systemType: 'oracle',  category: 'performance',  unit: '%',     warnThreshold: 70,   critThreshold: 90,  direction: 'high' },
  // MySQL
  { metricId: 'mysql.datadir.usage',        name: '데이터 디렉토리 사용률',    systemType: 'mysql',   category: 'capacity',     unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'mysql.innodb_buffer.hit',    name: 'InnoDB Buffer Pool Hit',    systemType: 'mysql',   category: 'performance',  unit: '%',     warnThreshold: 95,   critThreshold: 90,  direction: 'low' },
  { metricId: 'mysql.slowquery.per_min',    name: '슬로우 쿼리/분',            systemType: 'mysql',   category: 'performance',  unit: 'count', warnThreshold: 10,   critThreshold: 50,  direction: 'high' },
  { metricId: 'mysql.connections.percent',  name: '최대 커넥션 사용률',        systemType: 'mysql',   category: 'performance',  unit: '%',     warnThreshold: 70,   critThreshold: 90,  direction: 'high' },
  { metricId: 'mysql.replication.lag_sec',  name: '복제 지연',                 systemType: 'mysql',   category: 'availability', unit: 'sec',   warnThreshold: 5,    critThreshold: 30,  direction: 'high' },
  // MariaDB (mysql과 동일 메트릭 ID prefix 구분)
  { metricId: 'mariadb.datadir.usage',      name: '데이터 디렉토리 사용률',    systemType: 'mariadb', category: 'capacity',     unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'mariadb.connections.percent',name: '최대 커넥션 사용률',        systemType: 'mariadb', category: 'performance',  unit: '%',     warnThreshold: 70,   critThreshold: 90,  direction: 'high' },
  { metricId: 'mariadb.replication.lag_sec',name: '복제 지연',                 systemType: 'mariadb', category: 'availability', unit: 'sec',   warnThreshold: 5,    critThreshold: 30,  direction: 'high' },
  // PostgreSQL
  { metricId: 'postgres.tablespace.usage',  name: '테이블스페이스 사용률',     systemType: 'postgres',category: 'capacity',     unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'postgres.cache.hit_ratio',   name: '캐시 히트율',               systemType: 'postgres',category: 'performance',  unit: '%',     warnThreshold: 95,   critThreshold: 90,  direction: 'low' },
  { metricId: 'postgres.connection.percent',name: '커넥션 사용률',             systemType: 'postgres',category: 'performance',  unit: '%',     warnThreshold: 70,   critThreshold: 90,  direction: 'high' },
  { metricId: 'postgres.deadlock.per_hour', name: '데드락/시간',               systemType: 'postgres',category: 'performance',  unit: 'count', warnThreshold: 1,    critThreshold: 10,  direction: 'high' },
  // Redis
  { metricId: 'redis.memory.usage',         name: '메모리 사용률',             systemType: 'redis',   category: 'capacity',     unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'redis.eviction.per_sec',     name: '키 evict/초',               systemType: 'redis',   category: 'performance',  unit: 'count', warnThreshold: 10,   critThreshold: 100, direction: 'high' },
  { metricId: 'redis.keyspace.hit_ratio',   name: 'Keyspace Hit Ratio',        systemType: 'redis',   category: 'performance',  unit: '%',     warnThreshold: 90,   critThreshold: 80,  direction: 'low' },
  { metricId: 'redis.connected_clients',    name: '연결 클라이언트 수',        systemType: 'redis',   category: 'performance',  unit: 'count', warnThreshold: 1000, critThreshold: 5000,direction: 'high' },
  // MongoDB
  { metricId: 'mongodb.storage.usage',      name: '스토리지 사용률',           systemType: 'mongodb', category: 'capacity',     unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'mongodb.connection.percent', name: '커넥션 사용률',             systemType: 'mongodb', category: 'performance',  unit: '%',     warnThreshold: 70,   critThreshold: 90,  direction: 'high' },
  { metricId: 'mongodb.replication.lag_sec',name: '복제 지연',                 systemType: 'mongodb', category: 'availability', unit: 'sec',   warnThreshold: 5,    critThreshold: 30,  direction: 'high' },
  // Linux
  { metricId: 'linux.disk.root_usage',      name: '/ 디스크 사용률',           systemType: 'linux',   category: 'capacity',     unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'linux.disk.var_usage',       name: '/var 디스크 사용률',        systemType: 'linux',   category: 'capacity',     unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'linux.cpu.load_avg_5m',      name: 'CPU Load Average (5분)',    systemType: 'linux',   category: 'performance',  unit: 'count', warnThreshold: 4,    critThreshold: 8,   direction: 'high' },
  { metricId: 'linux.memory.usage',         name: '메모리 사용률',             systemType: 'linux',   category: 'capacity',     unit: '%',     warnThreshold: 85,   critThreshold: 95,  direction: 'high' },
  { metricId: 'linux.swap.usage',           name: '스왑 사용률',               systemType: 'linux',   category: 'capacity',     unit: '%',     warnThreshold: 30,   critThreshold: 60,  direction: 'high' },
  // Windows
  { metricId: 'windows.disk.c_usage',       name: 'C: 디스크 사용률',          systemType: 'windows', category: 'capacity',     unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'windows.cpu.usage',          name: 'CPU 사용률',                systemType: 'windows', category: 'performance',  unit: '%',     warnThreshold: 80,   critThreshold: 95,  direction: 'high' },
  { metricId: 'windows.memory.usage',       name: '메모리 사용률',             systemType: 'windows', category: 'capacity',     unit: '%',     warnThreshold: 85,   critThreshold: 95,  direction: 'high' },
  // WebLogic
  { metricId: 'weblogic.heap.usage',        name: 'JVM Heap 사용률',           systemType: 'weblogic',category: 'capacity',     unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'weblogic.thread.stuck',      name: 'Stuck Threads',             systemType: 'weblogic',category: 'performance',  unit: 'count', warnThreshold: 1,    critThreshold: 5,   direction: 'high' },
  { metricId: 'weblogic.jdbc.pool_usage',   name: 'JDBC 풀 사용률',            systemType: 'weblogic',category: 'performance',  unit: '%',     warnThreshold: 70,   critThreshold: 90,  direction: 'high' },
  // AWS RDS
  { metricId: 'aws_rds.storage.free_gb',    name: '남은 스토리지',             systemType: 'aws_rds', category: 'capacity',     unit: 'GB',    warnThreshold: 20,   critThreshold: 5,   direction: 'low' },
  { metricId: 'aws_rds.cpu.percent',        name: 'CPU 사용률',                systemType: 'aws_rds', category: 'performance',  unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'aws_rds.connections',        name: '커넥션 수',                 systemType: 'aws_rds', category: 'performance',  unit: 'count', warnThreshold: 500,  critThreshold: 900, direction: 'high' },
  // AWS EC2
  { metricId: 'aws_ec2.cpu.percent',        name: 'CPU 사용률',                systemType: 'aws_ec2', category: 'performance',  unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'aws_ec2.disk.usage',         name: '디스크 사용률',             systemType: 'aws_ec2', category: 'capacity',     unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  // Security
  { metricId: 'security.session.percent',   name: '세션 사용률',               systemType: 'security',category: 'performance',  unit: '%',     warnThreshold: 70,   critThreshold: 90,  direction: 'high' },
  { metricId: 'security.cpu.percent',       name: 'CPU 사용률',                systemType: 'security',category: 'performance',  unit: '%',     warnThreshold: 80,   critThreshold: 95,  direction: 'high' },
  { metricId: 'security.policy.match_sec',  name: '정책 매칭/초',              systemType: 'security',category: 'performance',  unit: 'count', warnThreshold: 50000,critThreshold: 100000,direction: 'high'},
  // Tomcat
  { metricId: 'tomcat.heap.usage',          name: 'JVM Heap 사용률',           systemType: 'tomcat',  category: 'capacity',     unit: '%',     warnThreshold: 80,   critThreshold: 90,  direction: 'high' },
  { metricId: 'tomcat.thread.active',       name: '활성 스레드 수',            systemType: 'tomcat',  category: 'performance',  unit: 'count', warnThreshold: 150,  critThreshold: 200, direction: 'high' },
];

const UPSERT = `
MERGE INTO METRIC_DEFINITIONS d
USING (SELECT :metricId AS metric_id FROM DUAL) src
ON (d.METRIC_ID = src.metric_id)
WHEN MATCHED THEN UPDATE SET
  NAME=:name, SYSTEM_TYPE=:systemType, CATEGORY=:category,
  UNIT=:unit, WARN_THRESHOLD=:warnThreshold, CRIT_THRESHOLD=:critThreshold,
  DIRECTION=:direction, DESCRIPTION=:description
WHEN NOT MATCHED THEN INSERT
  (METRIC_ID, NAME, SYSTEM_TYPE, CATEGORY, UNIT, WARN_THRESHOLD, CRIT_THRESHOLD, DIRECTION, DESCRIPTION)
VALUES
  (:metricId, :name, :systemType, :category, :unit, :warnThreshold, :critThreshold, :direction, :description)
`;

async function main() {
  if (!getOracleConnectString()) throw new Error('DATABASE_URL is missing');

  await withOracleConnection(async conn => {
    for (const def of DEFINITIONS) {
      await conn.execute(UPSERT, {
        metricId:      def.metricId,
        name:          def.name,
        systemType:    def.systemType,
        category:      def.category,
        unit:          def.unit,
        warnThreshold: def.warnThreshold,
        critThreshold: def.critThreshold,
        direction:     def.direction,
        description:   def.description || null,
      });
    }
    await conn.commit();
  });

  console.log(`Seeded ${DEFINITIONS.length} metric definitions.`);
}

main()
  .catch(error => {
    console.error('[seed:metric-definitions] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeOraclePool();
  });
