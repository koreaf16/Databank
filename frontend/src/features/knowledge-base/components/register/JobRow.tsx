/**
 * 파일: frontend/src/features/knowledge-base/components/register/JobRow.tsx
 * 역할: 지식베이스 업로드/등록 작업의 진행률 표시 행 컴포넌트.
 */

import React from 'react';

export function JobRow({ job }: { job: any }) {
  const pct = job.progress ?? 0;
  const done = job.status === 'done', fail = job.status === 'failed';
  return (
    <div className="kb-upload-job">
      <div className="kb-upload-job-header">
        <span className="kb-upload-job-name" title={job.id}>{job.name || job.id}</span>
        <span className={'kb-upload-job-status ' + (job.status || 'queued')}>
          {done ? '완료' : fail ? '실패' : job.stage ?? '처리 중'}
        </span>
      </div>
      <div className="kb-progress">
        <div style={{ width: pct + '%', background: fail ? 'var(--color-danger)' : undefined }}/>
      </div>
    </div>
  );
}
