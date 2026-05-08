/**
 * 파일: frontend/src/features/messaging/parts/ChannelReports.tsx
 * 역할: 채널(고객사)별 업무 내역서 목록 및 PDF 다운로드 관리.
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { SlidePanel } from '../../../components/common/SlidePanel.jsx';
import { getReportTemplates } from '../../settings/api/settingsApi.js';
import { getAuthToken } from '../../../shared/api/apiClient.js';
import {
  getReportMasterTemplate,
  publishReportMasterTemplates,
  snapshotReportMasterTemplate,
  subscribeReportMasterTemplate,
} from '../../../reportMasterTemplate.js';

const SIG_STEPS = ['초안', '검토', '고객전달', '서명', '확정'];

function ReportSigProgress({ signatureStatus }: any) {
  const stepMap: any = { draft: 0, reviewing: 1, sent: 2, pending: 3, signed: 4 };
  const cur = stepMap[signatureStatus] ?? (signatureStatus === 'none' ? -1 : 0);
  return (
    <div className="sig-progress">
      {SIG_STEPS.map((step, i) => (
        <React.Fragment key={step}>
          <span className={'sig-dot' + (i <= cur ? ' done' : '')} title={step}/>
          {i < SIG_STEPS.length - 1 && <span className={'sig-line' + (i < cur ? ' done' : '')}/>}
        </React.Fragment>
      ))}
      <span className="sig-step-label">{SIG_STEPS[Math.max(0, cur)]}</span>
    </div>
  );
}

function pickReportMasterTemplate(templates: any[], customerId: any) {
  return templates.find(t => String(t.customerId) === String(customerId)) || templates.find(t => !t.customerId) || templates[0] || getReportMasterTemplate(customerId);
}

// 업무·서버 N:M:
//   workspaceId   : 선택된 업무. 헤더에 컨텍스트 안내로 표시.
//                   실제 보고서 데이터 필터는 백엔드 reports API가 workspace 단위로 분리되면 연결.
//   serverIds[]   : 다중 선택된 서버 — 부분 보고서 표시 (현재 헤더에 개수만).
export function ChannelReports({
  channel,
  services = [],
  activeServiceId = 'all',
  showOtherTeams = true,
  myTeamId,
  workspaceId = null,
  workspaceName = null,
  serverIds = [],
}: any) {
  const [template, setTemplate] = React.useState<any>(() => getReportMasterTemplate(channel?.customerId));
  const [drafts, setDrafts] = React.useState<any>({});
  const [activeReportId, setActiveReportId] = React.useState<any>(null);
  const [downloadingId, setDownloadingId] = React.useState<any>(null);
  const [previewReportId, setPreviewReportId] = React.useState<any>(null);

  const API_BASE = (window as any).DATABANK_API_BASE || '';

  React.useEffect(() => {
    let active = true;
    getReportTemplates()
      .then(rows => {
        if (!active) return;
        const templates = Array.isArray(rows) && rows.length > 0
          ? publishReportMasterTemplates(rows)
          : [getReportMasterTemplate(channel?.customerId)];
        setTemplate(pickReportMasterTemplate(templates, channel?.customerId));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [channel?.customerId]);

  React.useEffect(() => subscribeReportMasterTemplate(templates => {
    setTemplate(pickReportMasterTemplate(templates, channel?.customerId));
  }), [channel?.customerId]);

  const visibleServices = services
    .filter((s: any) => activeServiceId === 'all' || s.id === activeServiceId)
    .filter((s: any) => showOtherTeams || s.teamId === myTeamId);
  const activeService = activeServiceId !== 'all' ? services.find((s: any) => s.id === activeServiceId) : null;
  
  // mock reports generation based on services
  const baseReports = visibleServices.flatMap((svc: any, svcIndex: number) => buildMasterServiceReports(svc, svcIndex, template));
  const reports = baseReports.map(report => ({
    ...report,
    draft: drafts[report.id] || { status: 'draft', signatureStatus: 'draft' },
  }));

  const activeReport = activeReportId ? reports.find(r => r.id === activeReportId) : null;
  const previewReport = previewReportId ? reports.find(r => r.id === previewReportId) : null;

  async function downloadReportPdf(report: any) {
    setDownloadingId(report.id);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/reports/render-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reportId: report.id }), // simplified for extraction
      });
      if (!response.ok) throw new Error('PDF 생성 실패');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.body.appendChild(document.createElement('a'));
      link.href = url;
      link.download = `${report.title}.pdf`;
      link.click();
      link.remove();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setDownloadingId(null);
    }
  }

  if (services.length === 0) {
    return <div className="page-pad"><div className="text-3">업무를 등록해 주세요.</div></div>;
  }

  return (
    <div className="page-pad scroll" style={{ height: '100%' }}>
      <div className="report-list-head" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3>업무별 내역서</h3>
          <p className="text-3">
            {workspaceId && workspaceName
              ? `업무: ${workspaceName}`
              : activeService ? `${activeService.name} · ${activeService.instance}` : `전체 업무 ${visibleServices.length}개`}
            {Array.isArray(serverIds) && serverIds.length > 0 && ` · 서버 ${serverIds.length}개 선택됨`}
          </p>
        </div>
        <span className="tag muted">{reports.length}건</span>
      </div>

      <div className="card report-list">
        <table className="report-table">
          <thead>
            <tr>
              <th style={{ width: 180 }}>업무</th>
              <th>내역서</th>
              <th style={{ width: 96 }}>구분</th>
              <th style={{ width: 100 }}>기간</th>
              <th style={{ width: 160 }}>서명 진행</th>
              <th style={{ width: 90 }}>상태</th>
              <th style={{ width: 86 }}></th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id} className="report-row" onClick={() => setPreviewReportId(r.id)}>
                <td><b>{r.service.name}</b></td>
                <td>{r.title}</td>
                <td><span className={'tag xs ' + r.kindClass}>{r.kind}</span></td>
                <td className="text-2">{r.period}</td>
                <td onClick={e => e.stopPropagation()}><ReportSigProgress signatureStatus={r.draft.signatureStatus}/></td>
                <td><span className="tag xs muted">{r.draft.status}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  <div className="report-actions">
                    <button className="btn icon ghost sm" onClick={() => downloadReportPdf(r)} disabled={downloadingId === r.id}>
                      <Icon name="download" size={12}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SlidePanel open={!!previewReport} onClose={() => setPreviewReportId(null)} title="내역서 미리보기" width={360}>
        {previewReport && (
          <div style={{ padding: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{previewReport.title}</div>
            <p className="text-3">{previewReport.summary}</p>
            <div style={{ marginTop: 20 }}>
               <button className="btn primary" style={{ width: '100%' }} onClick={() => downloadReportPdf(previewReport)}>PDF 다운로드</button>
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}

function buildMasterServiceReports(service: any, index: number, template: any) {
  return [
    {
      id: `${service.id}-monthly`,
      service,
      title: `${service.name} 점검내역서`,
      summary: '월간 점검 결과 요약',
      kind: '점검',
      kindClass: 'routine',
      period: '2026.04',
      createdAt: '2026.05.01',
    }
  ];
}
