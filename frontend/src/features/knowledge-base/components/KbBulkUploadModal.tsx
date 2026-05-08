/**
 * 파일: frontend/src/features/knowledge-base/components/KbBulkUploadModal.tsx
 * 역할: 다중 파일 드래그앤드롭 업로드 모달.
 *       업로드 후 SSE로 잡 진행률 구독, 완료 시 onDone() 호출.
 *
 * 연관 파일:
 *   - api/kbUploadApi.ts          : uploadFiles, subscribeJobProgress
 *   - KnowledgeBasePage.tsx       : showBulkUpload 상태로 열림
 *   - components/Icon.jsx         : 아이콘
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { uploadFiles, subscribeJobProgress } from '../api/kbUploadApi.js';

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.md';
const MAX_FILES = 50;

function JobRow({ job }) {
  const isDone = job.status === 'done';
  const isFailed = job.status === 'failed';
  const pct = job.progress ?? 0;
  return (
    <div className="kb-upload-job">
      <div className="kb-upload-job-header">
        <span className="kb-upload-job-name">{job.id}</span>
        <span className={'kb-upload-job-status ' + job.status}>
          {isDone ? '완료' : isFailed ? '실패' : job.stage ?? '처리 중'}
        </span>
      </div>
      <div className="kb-progress">
        <div
          style={{
            width: `${pct}%`,
            background: isFailed ? 'var(--color-danger)' : undefined,
          }}
        />
      </div>
    </div>
  );
}

export function KbBulkUploadModal({ categories, selectedCategoryId, onDone, onClose }) {
  const [files, setFiles] = React.useState([]);
  const [categoryId, setCategoryId] = React.useState(selectedCategoryId || categories?.[0]?.id || '');
  const [phase, setPhase] = React.useState('select'); // select | uploading | tracking | done
  const [jobs, setJobs] = React.useState([]);
  const [error, setError] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef(null);
  const unsubRef = React.useRef(null);

  function addFiles(newFiles) {
    setFiles((prev) => {
      const merged = [...prev];
      for (const f of newFiles) {
        if (merged.length >= MAX_FILES) break;
        if (!merged.some((m) => m.name === f.name && m.size === f.size)) {
          merged.push(f);
        }
      }
      return merged;
    });
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  async function startUpload() {
    if (files.length === 0) return;
    setPhase('uploading');
    setError('');
    try {
      const result = await uploadFiles(files, categoryId || undefined);
      const { jobIds } = result;
      setJobs(jobIds.map((id) => ({ id, status: 'queued', progress: 0, stage: 'queued' })));
      setPhase('tracking');

      unsubRef.current = subscribeJobProgress(
        jobIds,
        (updatedJobs) => setJobs(updatedJobs),
        () => {
          setPhase('done');
          onDone?.();
        },
      );
    } catch (err) {
      setError(err.message ?? '업로드에 실패했습니다');
      setPhase('select');
    }
  }

  // 모달 닫힐 때 SSE 구독 해제
  React.useEffect(() => {
    return () => unsubRef.current?.();
  }, []);

  const doneCount = jobs.filter((j) => j.status === 'done').length;
  const failCount = jobs.filter((j) => j.status === 'failed').length;

  return (
    <div className="modal-backdrop">
      <div className="modal lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">지식베이스 일괄 업로드</div>
            <div className="text-3" style={{ fontSize: 12, marginTop: 4, color: 'var(--text-3)' }}>
              PDF, DOCX, XLSX, TXT 등 최대 {MAX_FILES}개의 문서를 한 번에 인덱싱합니다.
            </div>
          </div>
          <button className="btn icon ghost" onClick={onClose}>
            <Icon name="x" size={18}/>
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 카테고리 선택 */}
          {phase === 'select' && (
            <label className="form-label">
              <span>카테고리</span>
              <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentId ? '  └ ' : ''}{c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* 드래그앤드롭 영역 */}
          {phase === 'select' && (
            <>
              <div
                className={'kb-dropzone' + (dragOver ? ' drag-over' : '')}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
                aria-label="파일 업로드 영역"
              >
                <Icon name="upload" size={28} className="text-3"/>
                <p>파일을 드래그하거나 클릭해서 선택</p>
                <p className="text-3">{ACCEPT} — 최대 {MAX_FILES}개</p>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  style={{ display: 'none' }}
                  onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
                />
              </div>

              {files.length > 0 && (
                <div className="kb-file-list">
                  {files.map((f, i) => (
                    <div key={i} className="kb-file-row">
                      <Icon name="file" size={14}/>
                      <span>{f.name}</span>
                      <span className="text-3">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                      <button
                        className="btn icon ghost xs"
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Icon name="x" size={11}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="kb-upload-error">
                  <Icon name="alert-circle" size={14}/>
                  {error}
                </div>
              )}
            </>
          )}

          {/* 업로드 중 */}
          {phase === 'uploading' && (
            <div className="kb-ask-loading">
              <Icon name="sparkles" size={16} className="spin"/>
              <span>업로드 중...</span>
            </div>
          )}

          {/* 잡 진행률 추적 */}
          {(phase === 'tracking' || phase === 'done') && (
            <div className="kb-upload-jobs">
              <div className="kb-upload-summary">
                전체 {jobs.length}개 · 완료 {doneCount} · 실패 {failCount}
              </div>
              {jobs.map((job) => <JobRow key={job.id} job={job}/>)}
            </div>
          )}
        </div>

        <div className="modal-foot">
          {phase === 'select' && (
            <>
              <button className="btn ghost" onClick={onClose}>취소</button>
              <button
                className="btn primary"
                disabled={files.length === 0}
                onClick={startUpload}
              >
                <Icon name="upload" size={14}/>
                {files.length}개 파일 업로드
              </button>
            </>
          )}
          {(phase === 'tracking' || phase === 'uploading') && (
            <button className="btn ghost" onClick={onClose}>백그라운드에서 계속</button>
          )}
          {phase === 'done' && (
            <button className="btn primary" onClick={onClose}>완료</button>
          )}
        </div>
      </div>
    </div>
  );
}
