/**
 * 파일: frontend/src/features/knowledge-base/components/KbDocDetail.jsx
 * 역할: 지식베이스 문서 상세 패널에서 쓰는 IndexStatus, DocTypeBadge, VersionMatchBadge, Meta 컴포넌트.
 *
 * 연관 파일:
 *   - KnowledgeBasePage.jsx : 상세 패널에서 import
 *   - kbUtils.js : docTypeLabel, indexStatusLabel
 */

import React from 'react';
import { docTypeLabel, indexStatusLabel, indexStageLabel } from '../utils/kbUtils.js';

export function IndexStatus({ status }) {
  const isRunning = status.status === 'indexing' || status.status === 'queued' || status.status === 'running' || status.progress > 0 && status.progress < 100;
  return (
    <div className="kb-index-mini">
      <span className={'kb-status ' + (isRunning ? status.stage || status.status : status.status)} title={status.message}>
        {isRunning ? `[${indexStageLabel(status.stage || status.status)} ${status.progress}%]` : indexStatusLabel(status.status)}
      </span>
      <div className="kb-progress"><div style={{ width: status.progress + '%' }}/></div>
      {status.status === 'failed' && <small style={{ color: 'var(--err)' }} title={status.message}>실패: {status.message}</small>}
    </div>
  );
}

export function DocTypeBadge({ type }) {
  return <span className="tag muted">{docTypeLabel(type)}</span>;
}

export function VersionMatchBadge({ match }) {
  const labels = { exact: '정확 일치', compatible: '버전 호환', general: '범용 문서' };
  return <span className={'kb-version-match ' + (match || 'none')}>{labels[match] || '버전 제외'}</span>;
}

export function Meta({ label, value }) {
  return <div><span>{label}</span><b>{value || '-'}</b></div>;
}
