/**
 * 파일: frontend/src/features/knowledge-base/components/KbJobQueuePanel.tsx
 * 역할: 인덱싱 큐 하단 고정 모달. 잡이 있으면 자동으로 표시되고 없으면 숨겨진다.
 *       bgJobs(SSE 실시간)와 dbJobs(DB 30초 폴링)를 머지해 표시.
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { listRecentJobs, cancelJob, deleteJob, deleteCompletedJobs } from '../api/kbUploadApi.js';

type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

interface Job {
  id: string;
  docId?: string | null;
  kind?: string;
  status: JobStatus;
  progress?: number;
  stage?: string | null;
  errorMsg?: string | null;
  enqueuedAt?: string;
  name?: string;
  docTitle?: string | null;
}

type FilterTab = 'all' | 'queued' | 'running' | 'done' | 'failed';

const KIND_LABEL: Record<string, string> = {
  parse: '추출',
  chunk: '청킹',
  embed: '벡터화',
  reindex: '재인덱스',
  download_url: '다운로드',
  crawl: '크롤',
};

const STATUS_LABEL: Record<string, string> = {
  queued: '대기',
  running: '진행',
  done: '완료',
  failed: '실패',
  cancelled: '취소됨',
};

function jobDisplayName(job: Job): string {
  return job.docTitle || job.name || job.id;
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

interface Props {
  bgJobs: Job[];
  onJobsChange: () => void;
  reloadRef?: React.MutableRefObject<(() => void) | null>;
}

export function KbJobQueuePanel({ bgJobs, onJobsChange, reloadRef }: Props) {
  const [dbJobs, setDbJobs] = React.useState<Job[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<FilterTab>('all');
  const [actioningId, setActioningId] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);
  const pollRef    = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const docPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  function mergeJobs(db: Job[], bg: Job[]): Job[] {
    const map = new Map<string, Job>(db.map(j => [j.id, j]));
    for (const j of bg) map.set(j.id, j);
    return [...map.values()].sort((a, b) =>
      (b.enqueuedAt ?? '').localeCompare(a.enqueuedAt ?? ''),
    );
  }

  async function load() {
    setLoading(true);
    try {
      const jobs = await listRecentJobs();
      setDbJobs(jobs);
    } catch (err) {
      console.error('[KbJobQueuePanel] 잡 목록 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (reloadRef) reloadRef.current = load;
    return () => { if (reloadRef) reloadRef.current = null; };
  }, [reloadRef]);

  React.useEffect(() => {
    load();
    pollRef.current = setInterval(load, 5_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // 새 bgJobs가 들어오면 접혀 있어도 펼친다
  React.useEffect(() => {
    if (bgJobs.some(j => j.status === 'queued' || j.status === 'running')) {
      setCollapsed(false);
    }
  }, [bgJobs]);

  const merged = mergeJobs(dbJobs, bgJobs);

  const counts = React.useMemo(() => ({
    active: merged.filter(j => j.status === 'queued' || j.status === 'running').length,
    done:   merged.filter(j => j.status === 'done').length,
    failed: merged.filter(j => j.status === 'failed').length,
  }), [merged]);

  // 활성 잡이 있으면 3초마다 문서 목록 갱신, 없어지면 한 번 더 갱신
  const hadActiveRef = React.useRef(false);
  React.useEffect(() => {
    if (counts.active > 0) {
      hadActiveRef.current = true;
      docPollRef.current = setInterval(onJobsChange, 3000);
      return () => {
        clearInterval(docPollRef.current!);
        docPollRef.current = null;
      };
    } else if (hadActiveRef.current) {
      onJobsChange();
    }
  }, [counts.active]);

  // 잡이 0건이면 표시하지 않습니다.
  if (loading && dbJobs.length === 0 && bgJobs.length === 0) return null;
  if (!loading && merged.length === 0) return null;

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all',     label: `전체 ${merged.length}` },
    { key: 'queued',  label: `대기 ${merged.filter(j => j.status === 'queued').length}` },
    { key: 'running', label: `진행 ${merged.filter(j => j.status === 'running').length}` },
    { key: 'done',    label: `완료 ${counts.done}` },
    { key: 'failed',  label: `실패 ${counts.failed}` },
  ];

  const visible = filter === 'all'
    ? merged
    : merged.filter(j => j.status === filter || (filter === 'failed' && j.status === 'cancelled'));

  async function handleCancel(jobId: string) {
    setActioningId(jobId);
    try {
      await cancelJob(jobId);
      await load();
      onJobsChange();
    } catch {
      // 조용히 실패
    } finally {
      setActioningId(null);
    }
  }

  async function handleDelete(jobId: string) {
    setActioningId(jobId);
    try {
      await deleteJob(jobId);
      setDbJobs(prev => prev.filter(j => j.id !== jobId));
      onJobsChange();
    } catch {
      // 조용히 실패
    } finally {
      setActioningId(null);
    }
  }

  async function handleClearDone() {
    if (!confirm('완료, 실패, 취소된 모든 인덱싱 작업을 삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await deleteCompletedJobs();
      await load();
      onJobsChange();
    } catch (err) {
      console.error('[KbJobQueuePanel] 일괄 삭제 실패:', err);
      alert('일괄 삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const hasFinished = merged.some(j => j.status === 'done' || j.status === 'failed' || j.status === 'cancelled');

  return (
    <div className="kb-queue-panel card" style={{ padding: collapsed ? '10px 14px' : '14px 16px', background: counts.active > 0 && collapsed ? 'var(--brand-50)' : undefined }}>
      <div className="kb-queue-panel-header" style={{ marginBottom: collapsed ? 0 : 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: collapsed ? 'pointer' : 'default' }} onClick={() => collapsed && setCollapsed(false)}>
          {counts.active > 0 && (
            <span className="spin" style={{ display: 'inline-flex', color: collapsed ? 'var(--brand-600)' : undefined }}>
              <Icon name="sparkles" size={14} />
            </span>
          )}
          <span style={{ color: counts.active > 0 && collapsed ? 'var(--brand-700)' : undefined }}>
            <b>인덱싱 큐</b>
            {counts.active > 0 && <> · 활성 <b>{counts.active}</b></>}
            {counts.done > 0 && <> · 완료 {counts.done}</>}
            {counts.failed > 0 && <> · 실패 <b style={{ color: 'var(--color-danger)' }}>{counts.failed}</b></>}
          </span>
        </div>
        <div className="kb-queue-header-actions">
          <button
            className="btn icon ghost xs"
            onClick={load}
            title="새로고침"
            disabled={loading}
          >
            <Icon name="refresh" size={12} className={loading ? 'spin' : ''} />
          </button>
          {hasFinished && !collapsed && (
            <button
              className="btn icon ghost xs"
              onClick={handleClearDone}
              title="완료·실패 일괄삭제"
            >
              <Icon name="trash" size={12} />
            </button>
          )}
          <button
            className="btn icon ghost xs"
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? '펼치기' : '접기'}
          >
            <Icon name={collapsed ? 'chevron-up' : 'chevron-down'} size={12} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="kb-queue-filter-tabs">
            {filterTabs.map(tab => (
              <button
                key={tab.key}
                className={`kb-queue-filter-tab${filter === tab.key ? ' active' : ''}`}
                onClick={() => setFilter(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="kb-queue-panel-jobs">
            {loading && visible.length === 0 && (
              <div className="kb-queue-empty">불러오는 중…</div>
            )}
            {!loading && visible.length === 0 && (
              <div className="kb-queue-empty">잡이 없습니다</div>
            )}
            {visible.map(job => {
              const pct = job.progress ?? 0;
              const isDone      = job.status === 'done';
              const isFail      = job.status === 'failed';
              const isCancelled = job.status === 'cancelled';
              const isActive    = job.status === 'queued' || job.status === 'running';
              const actioning   = actioningId === job.id;

              return (
                <div key={job.id} className="kb-upload-job">
                  <div className="kb-upload-job-header">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="kb-upload-job-name" title={jobDisplayName(job)}>
                        {jobDisplayName(job)}
                      </span>
                      <span className="kb-queue-job-kind">
                        {KIND_LABEL[job.kind ?? ''] ?? job.kind}
                      </span>
                    </div>
                    <div className="kb-queue-job-right">
                      <span className={`kb-upload-job-status ${job.status}`} title={job.errorMsg ?? undefined}>
                        {isDone ? '완료' : isFail ? '실패' : isCancelled ? '취소됨' : job.stage ?? STATUS_LABEL[job.status] ?? job.status}
                      </span>
                      <div className="kb-queue-job-actions">
                        {isActive && (
                          <button
                            className="btn xs ghost"
                            style={{ fontSize: 10, padding: '1px 6px' }}
                            onClick={() => handleCancel(job.id)}
                            disabled={actioning}
                            title="잡 취소"
                          >
                            취소
                          </button>
                        )}
                        {(isDone || isFail || isCancelled) && (
                          <button
                            className="btn xs ghost"
                            style={{ fontSize: 10, padding: '1px 6px' }}
                            onClick={() => handleDelete(job.id)}
                            disabled={actioning}
                            title="잡 삭제"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="kb-progress">
                    <div
                      style={{
                        width: isDone ? '100%' : `${pct}%`,
                        background: isFail || isCancelled ? 'var(--color-danger)' : undefined,
                        opacity: isCancelled ? 0.5 : 1,
                      }}
                    />
                  </div>
                  {job.enqueuedAt && (
                    <div className="kb-queue-job-time">{timeAgo(job.enqueuedAt)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
