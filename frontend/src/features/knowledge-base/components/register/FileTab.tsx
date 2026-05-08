/**
 * 파일: frontend/src/features/knowledge-base/components/register/FileTab.tsx
 * 역할: 지식베이스 문서 등록 - 파일 업로드 탭 컴포넌트.
 *
 * 연관 파일:
 *   - ../KbRegisterModal.tsx : 부모 모달 컴포넌트
 *   - ../../api/kbUploadApi.ts : 업로드 API
 */

import React from 'react';
import { Icon } from '../../../../components/Icon.jsx';
import { VersionTagInput } from './VersionTagInput';
import { JobRow } from './JobRow';
import { uploadFiles, subscribeJobProgress } from '../../api/kbUploadApi.js';

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.pptx,.ppt,.txt,.md';
const MAX_FILES = 50;

export function FileTab({ 
  categories, 
  defaultCatId, 
  products, 
  onClose, 
  onBackground, 
  onDone 
}: any) {
  const [files, setFiles] = React.useState<any[]>([]);
  const [fileCatId, setFileCatId] = React.useState(defaultCatId);
  const [fileTags, setFileTags] = React.useState('');
  const [fileDocType, setFileDocType] = React.useState('vendor_manual');
  const [fileProductName, setFileProductName] = React.useState('');
  const [fileProductId, setFileProductId] = React.useState('');
  const [fileVersions, setFileVersions] = React.useState<string[]>([]);
  const [fileSuggestedVersions, setFileSuggestedVersions] = React.useState<string[]>([]);
  const [fileVendor, setFileVendor] = React.useState('');
  const [fileOsPlatform, setFileOsPlatform] = React.useState('');
  const [fileVersionRange, setFileVersionRange] = React.useState('');
  const [filePhase, setFilePhase] = React.useState('select');
  const [fileJobs, setFileJobs] = React.useState<any[]>([]);
  const [fileError, setFileError] = React.useState('');
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const fileUnsubRef = React.useRef<any>(null);

  React.useEffect(() => () => fileUnsubRef.current?.(), []);

  React.useEffect(() => {
    const p = products.find((x: any) => x.canonical === fileProductName);
    setFileProductId(p?.id ?? '');
    if (p?.vendor && !fileVendor) setFileVendor(p.vendor);
  }, [fileProductName, products]);

  function addFiles(newFiles: File[]) {
    setFiles(prev => {
      const merged = [...prev];
      for (const f of newFiles) {
        if (merged.length >= MAX_FILES) break;
        if (!merged.some(m => m.name === f.name && m.size === f.size)) merged.push(f);
      }
      return merged;
    });
  }

  async function startFileUpload() {
    if (!files.length) return;
    setFilePhase('uploading');
    setFileError('');
    setUploadProgress(0);
    const versions = fileVersions.length ? fileVersions : undefined;
    try {
      const result = await uploadFiles(
        files, fileCatId, fileTags || undefined,
        fileDocType, fileProductId || undefined,
        fileProductName || undefined, versions,
        setUploadProgress,
        fileVendor || undefined,
        fileOsPlatform || undefined,
        fileVersionRange || undefined,
      );
      const jobIds = result.jobIds ?? [];
      const fileNames = (result.files ?? []).map((f: any) => f.fileName);
      setFileJobs(jobIds.map((id: string, i: number) => ({ id, name: fileNames[i] ?? id, status: 'queued', progress: 0, stage: 'queued' })));
      setFilePhase('tracking');
      fileUnsubRef.current = subscribeJobProgress(jobIds, setFileJobs, () => setFilePhase('done'));
    } catch (err: any) {
      setFileError(err.message ?? '업로드 실패');
      setFilePhase('select');
    }
  }

  const catOptions = categories.map((c: any) => (
    <option key={c.id} value={c.id}>{c.parentId ? '  └ ' : ''}{c.name}</option>
  ));

  const docTypeOptions = (
    <>
      <option value="vendor_manual">벤더문서</option>
      <option value="check_item">점검항목</option>
      <option value="runbook">Runbook</option>
      <option value="training">교육자료</option>
      <option value="incident_case">장애사례</option>
    </>
  );

  const filesDoneCount = fileJobs.filter(j => j.status === 'done').length;

  return (
    <>
      {filePhase === 'select' && (
        <div className="kb-register-form-body">
          <div className="kb-register-row">
            <label className="form-label">
              <span>카테고리</span>
              <select className="input" value={fileCatId} onChange={e => setFileCatId(e.target.value)}>{catOptions}</select>
            </label>
            <label className="form-label">
              <span>문서유형</span>
              <select className="input" value={fileDocType} onChange={e => setFileDocType(e.target.value)}>{docTypeOptions}</select>
            </label>
          </div>
          {/* ... (rest of the form fields similar to the original) */}
          <div
            className={'kb-dropzone' + (dragOver ? ' drag-over' : '')}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles([...Array.from(e.dataTransfer.files)]); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="upload" size={28} className="text-3"/>
            <p>파일을 드래그하거나 클릭해서 선택</p>
            <p className="text-3">{ACCEPT} — 최대 {MAX_FILES}개</p>
            <input ref={fileInputRef} type="file" multiple accept={ACCEPT} style={{ display: 'none' }}
              onChange={e => e.target.files && addFiles([...Array.from(e.target.files)])}/>
          </div>
          {/* File List and Errors */}
        </div>
      )}
      {/* Phases for Uploading, Tracking, Done */}
      <div className="modal-foot">
        {filePhase === 'select' && (
          <>
            <button className="btn ghost" onClick={onClose}>취소</button>
            <button className="btn primary" disabled={!files.length || !fileCatId} onClick={startFileUpload}>
              <Icon name="upload" size={14}/> {files.length}개 파일 업로드
            </button>
          </>
        )}
        {/* ... (footer buttons for other phases) */}
      </div>
    </>
  );
}
