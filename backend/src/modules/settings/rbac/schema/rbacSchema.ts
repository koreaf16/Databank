/**
 * 파일: backend/src/modules/settings/rbac/schema/rbacSchema.ts
 * 역할: RBAC 4개 테이블 DDL + 기본 seed 데이터.
 *       RBAC_ROLES, RBAC_PERMISSION_GROUPS, RBAC_PERMISSIONS, RBAC_ROLE_PERMISSIONS.
 *
 * 연관 파일:
 *   - repository/rbacRepository.ts : CRUD
 *   - routes/rbacRoutes.ts         : HTTP 라우트
 *   - server.ts                    : 스키마 초기화 호출
 */

import { isAlreadyExists, isUniqueError } from '../../../../infra/oracle/errorCodes.js';

const DDL = [
  `CREATE TABLE RBAC_ROLES (
     ROLE_ID     VARCHAR2(50 CHAR)  NOT NULL,
     LABEL       VARCHAR2(100 CHAR) NOT NULL,
     COLOR       VARCHAR2(20),
     DESCRIPTION VARCHAR2(500 CHAR),
     SORT_ORDER  NUMBER             DEFAULT 0  NOT NULL,
     ENABLED     NUMBER(1)          DEFAULT 1  NOT NULL,
     CONSTRAINT PK_RBAC_ROLES PRIMARY KEY (ROLE_ID)
   )`,
  `CREATE TABLE RBAC_PERMISSION_GROUPS (
     GROUP_ID   VARCHAR2(50 CHAR)  NOT NULL,
     LABEL      VARCHAR2(100 CHAR) NOT NULL,
     SORT_ORDER NUMBER             DEFAULT 0 NOT NULL,
     CONSTRAINT PK_RBAC_PERM_GROUPS PRIMARY KEY (GROUP_ID)
   )`,
  `CREATE TABLE RBAC_PERMISSIONS (
     PERM_ID    VARCHAR2(100 CHAR) NOT NULL,
     GROUP_ID   VARCHAR2(50 CHAR)  NOT NULL,
     LABEL      VARCHAR2(200 CHAR) NOT NULL,
     SORT_ORDER NUMBER             DEFAULT 0 NOT NULL,
     CONSTRAINT PK_RBAC_PERMISSIONS   PRIMARY KEY (PERM_ID),
     CONSTRAINT FK_RBAC_PERM_GRP      FOREIGN KEY (GROUP_ID) REFERENCES RBAC_PERMISSION_GROUPS(GROUP_ID)
   )`,
  `CREATE TABLE RBAC_ROLE_PERMISSIONS (
     ROLE_ID    VARCHAR2(50 CHAR)  NOT NULL,
     PERM_ID    VARCHAR2(100 CHAR) NOT NULL,
     PERM_VALUE VARCHAR2(20 CHAR)  DEFAULT 'false' NOT NULL,
     CONSTRAINT PK_RBAC_ROLE_PERMS  PRIMARY KEY (ROLE_ID, PERM_ID),
     CONSTRAINT FK_RBAC_RP_ROLE     FOREIGN KEY (ROLE_ID)  REFERENCES RBAC_ROLES(ROLE_ID),
     CONSTRAINT FK_RBAC_RP_PERM     FOREIGN KEY (PERM_ID)  REFERENCES RBAC_PERMISSIONS(PERM_ID)
   )`,
];

// ── 기본 seed 데이터 ──────────────────────────────────────────────────────────

const SEED_ROLES = [
  { id: 'admin',    label: '관리자',   color: '#e2435d', desc: '시스템 전체 관리, 모든 권한',         order: 1 },
  { id: 'manager',  label: '팀장',     color: '#7c5cff', desc: '팀 데이터 + 보고서 + 사용자 관리',   order: 2 },
  { id: 'engineer', label: '엔지니어', color: '#5b8eff', desc: '담당 고객사 운영, 이력 등록',         order: 3 },
  { id: 'sales',    label: '영업',     color: '#15a06a', desc: '고객사 정보 조회 + 보고서 열람',      order: 4 },
];

const SEED_GROUPS = [
  { id: 'channel',   label: '채널·메시지', order: 1 },
  { id: 'history',   label: '지원이력',    order: 2 },
  { id: 'knowledge', label: '지식관리',    order: 3 },
  { id: 'customer',  label: '고객사',      order: 4 },
  { id: 'org',       label: '조직도',      order: 5 },
  { id: 'ai',        label: 'AI 모델',     order: 6 },
  { id: 'template',  label: '템플릿',      order: 7 },
  { id: 'sys',       label: '시스템',      order: 8 },
];

const SEED_PERMS = [
  { id: 'channel.view',         gid: 'channel',   label: '채널 조회',           order: 1 },
  { id: 'channel.send',         gid: 'channel',   label: '메시지 전송',         order: 2 },
  { id: 'channel.delete',       gid: 'channel',   label: '메시지 삭제',         order: 3 },
  { id: 'channel.manage',       gid: 'channel',   label: '채널 설정',           order: 4 },
  { id: 'history.view',         gid: 'history',   label: '이력 조회',           order: 1 },
  { id: 'history.create',       gid: 'history',   label: '이력 등록',           order: 2 },
  { id: 'history.edit',         gid: 'history',   label: '이력 수정',           order: 3 },
  { id: 'history.delete',       gid: 'history',   label: '이력 삭제',           order: 4 },
  { id: 'knowledge.view',       gid: 'knowledge', label: '문서 조회',           order: 1 },
  { id: 'knowledge.rag',        gid: 'knowledge', label: 'RAG 검색',            order: 2 },
  { id: 'knowledge.create',     gid: 'knowledge', label: '문서 등록',           order: 3 },
  { id: 'knowledge.edit',       gid: 'knowledge', label: '문서/메타 수정',      order: 4 },
  { id: 'knowledge.delete',     gid: 'knowledge', label: '문서 삭제',           order: 5 },
  { id: 'knowledge.category',   gid: 'knowledge', label: '카테고리 관리',       order: 6 },
  { id: 'knowledge.reindex',    gid: 'knowledge', label: '청킹/벡터 재처리',    order: 7 },
  { id: 'customer.view',        gid: 'customer',  label: '조회',                order: 1 },
  { id: 'customer.create',      gid: 'customer',  label: '등록',                order: 2 },
  { id: 'customer.edit',        gid: 'customer',  label: '수정',                order: 3 },
  { id: 'customer.delete',      gid: 'customer',  label: '삭제',                order: 4 },
  { id: 'customer.assign',      gid: 'customer',  label: '담당자 지정',         order: 5 },
  { id: 'customer.server.create',    gid: 'customer', label: '서버 등록',          order: 6 },
  { id: 'customer.server.assign',    gid: 'customer', label: '서버 담당자 지정',   order: 7 },
  { id: 'customer.workspace.create', gid: 'customer', label: '업무 등록/삭제',     order: 8 },
  { id: 'customer.workspace.assign', gid: 'customer', label: '업무 담당자 지정',   order: 9 },
  { id: 'org.view',             gid: 'org',       label: '조회',                order: 1 },
  { id: 'org.manage',           gid: 'org',       label: '부서/직원 관리',      order: 2 },
  { id: 'ai.view',              gid: 'ai',        label: '조회',                order: 1 },
  { id: 'ai.manage',            gid: 'ai',        label: '등록/수정',           order: 2 },
  { id: 'ai.key',               gid: 'ai',        label: 'API 키 열람',         order: 3 },
  { id: 'template.view',        gid: 'template',  label: '템플릿 조회',         order: 1 },
  { id: 'template.global',      gid: 'template',  label: '전사 템플릿 관리',    order: 2 },
  { id: 'template.customer',    gid: 'template',  label: '담당 고객사 템플릿 관리', order: 3 },
  { id: 'template.assign',      gid: 'template',  label: '템플릿 적용/배정',    order: 4 },
  { id: 'template.signature',   gid: 'template',  label: '서명 정책 관리',      order: 5 },
  { id: 'sys.audit',            gid: 'sys',       label: '감사 로그',           order: 1 },
  { id: 'sys.policy',           gid: 'sys',       label: '알림/SLA 정책',       order: 2 },
  { id: 'sys.template',         gid: 'sys',       label: '체크리스트 템플릿',   order: 3 },
];

// 기본 매트릭스 — true|false|self
const SEED_MATRIX: Record<string, Record<string, string>> = {
  admin: {
    'channel.view': 'true', 'channel.send': 'true', 'channel.delete': 'true', 'channel.manage': 'true',
    'history.view': 'true', 'history.create': 'true', 'history.edit': 'true', 'history.delete': 'true',
    'knowledge.view': 'true', 'knowledge.rag': 'true', 'knowledge.create': 'true', 'knowledge.edit': 'true',
    'knowledge.delete': 'true', 'knowledge.category': 'true', 'knowledge.reindex': 'true',
    'customer.view': 'true', 'customer.create': 'true', 'customer.edit': 'true', 'customer.delete': 'true', 'customer.assign': 'true',
    'customer.server.create': 'true', 'customer.server.assign': 'true',
    'customer.workspace.create': 'true', 'customer.workspace.assign': 'true',
    'org.view': 'true', 'org.manage': 'true',
    'ai.view': 'true', 'ai.manage': 'true', 'ai.key': 'true',
    'template.view': 'true', 'template.global': 'true', 'template.customer': 'true',
    'template.assign': 'true', 'template.signature': 'true',
    'sys.audit': 'true', 'sys.policy': 'true', 'sys.template': 'true',
  },
  manager: {
    'channel.view': 'true', 'channel.send': 'true', 'channel.delete': 'true', 'channel.manage': 'true',
    'history.view': 'true', 'history.create': 'true', 'history.edit': 'true', 'history.delete': 'false',
    'knowledge.view': 'true', 'knowledge.rag': 'true', 'knowledge.create': 'true', 'knowledge.edit': 'true',
    'knowledge.delete': 'false', 'knowledge.category': 'true', 'knowledge.reindex': 'true',
    'customer.view': 'true', 'customer.create': 'true', 'customer.edit': 'true', 'customer.delete': 'false', 'customer.assign': 'true',
    'customer.server.create': 'true', 'customer.server.assign': 'true',
    'customer.workspace.create': 'true', 'customer.workspace.assign': 'true',
    'org.view': 'true', 'org.manage': 'false',
    'ai.view': 'true', 'ai.manage': 'false', 'ai.key': 'false',
    'template.view': 'true', 'template.global': 'false', 'template.customer': 'true',
    'template.assign': 'true', 'template.signature': 'false',
    'sys.audit': 'false', 'sys.policy': 'false', 'sys.template': 'false',
  },
  engineer: {
    'channel.view': 'true', 'channel.send': 'true', 'channel.delete': 'self', 'channel.manage': 'false',
    'history.view': 'true', 'history.create': 'true', 'history.edit': 'self', 'history.delete': 'false',
    'knowledge.view': 'true', 'knowledge.rag': 'true', 'knowledge.create': 'true', 'knowledge.edit': 'self',
    'knowledge.delete': 'false', 'knowledge.category': 'false', 'knowledge.reindex': 'false',
    'customer.view': 'true', 'customer.create': 'false', 'customer.edit': 'false', 'customer.delete': 'false', 'customer.assign': 'false',
    'customer.server.create': 'false', 'customer.server.assign': 'false',
    'customer.workspace.create': 'false', 'customer.workspace.assign': 'false',
    'org.view': 'true', 'org.manage': 'false',
    'ai.view': 'true', 'ai.manage': 'false', 'ai.key': 'false',
    'template.view': 'true', 'template.global': 'false', 'template.customer': 'false',
    'template.assign': 'false', 'template.signature': 'false',
    'sys.audit': 'false', 'sys.policy': 'false', 'sys.template': 'false',
  },
  sales: {
    'channel.view': 'true', 'channel.send': 'true', 'channel.delete': 'false', 'channel.manage': 'false',
    'history.view': 'true', 'history.create': 'false', 'history.edit': 'false', 'history.delete': 'false',
    'knowledge.view': 'true', 'knowledge.rag': 'true', 'knowledge.create': 'false', 'knowledge.edit': 'false',
    'knowledge.delete': 'false', 'knowledge.category': 'false', 'knowledge.reindex': 'false',
    'customer.view': 'true', 'customer.create': 'false', 'customer.edit': 'false', 'customer.delete': 'false', 'customer.assign': 'false',
    'customer.server.create': 'false', 'customer.server.assign': 'false',
    'customer.workspace.create': 'false', 'customer.workspace.assign': 'false',
    'org.view': 'true', 'org.manage': 'false',
    'ai.view': 'false', 'ai.manage': 'false', 'ai.key': 'false',
    'template.view': 'true', 'template.global': 'false', 'template.customer': 'false',
    'template.assign': 'false', 'template.signature': 'false',
    'sys.audit': 'false', 'sys.policy': 'false', 'sys.template': 'false',
  },
};

export async function ensureRbacSchema(connection) {
  // 테이블 생성
  for (const ddl of DDL) {
    try { await connection.execute(ddl); }
    catch (err) { if (!isAlreadyExists(err)) throw err; }
  }

  // Roles seed
  for (const r of SEED_ROLES) {
    try {
      await connection.execute(
        `INSERT INTO RBAC_ROLES (ROLE_ID, LABEL, COLOR, DESCRIPTION, SORT_ORDER, ENABLED)
         VALUES (:roleId, :roleLabel, :roleColor, :roleDesc, :sortOrder, 1)`,
        { roleId: r.id, roleLabel: r.label, roleColor: r.color, roleDesc: r.desc, sortOrder: r.order },
      );
    } catch (err) { if (!isUniqueError(err)) throw err; }
  }

  // Permission groups seed
  for (const g of SEED_GROUPS) {
    try {
      await connection.execute(
        `INSERT INTO RBAC_PERMISSION_GROUPS (GROUP_ID, LABEL, SORT_ORDER) VALUES (:groupId, :groupLabel, :sortOrder)`,
        { groupId: g.id, groupLabel: g.label, sortOrder: g.order },
      );
    } catch (err) { if (!isUniqueError(err)) throw err; }
  }

  // Permissions seed
  for (const p of SEED_PERMS) {
    try {
      await connection.execute(
        `INSERT INTO RBAC_PERMISSIONS (PERM_ID, GROUP_ID, LABEL, SORT_ORDER) VALUES (:permId, :groupId, :permLabel, :sortOrder)`,
        { permId: p.id, groupId: p.gid, permLabel: p.label, sortOrder: p.order },
      );
    } catch (err) { if (!isUniqueError(err)) throw err; }
  }

  // Matrix seed
  for (const [roleId, perms] of Object.entries(SEED_MATRIX)) {
    for (const [permId, value] of Object.entries(perms)) {
      try {
        await connection.execute(
          `INSERT INTO RBAC_ROLE_PERMISSIONS (ROLE_ID, PERM_ID, PERM_VALUE) VALUES (:roleId, :permId, :value)`,
          { roleId, permId, value },
        );
      } catch (err) { if (!isUniqueError(err)) throw err; }
    }
  }
}
