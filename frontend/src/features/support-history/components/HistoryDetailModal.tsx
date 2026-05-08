/**
 * 파일: frontend/src/features/support-history/components/HistoryDetailModal.jsx
 * 역할: 지원이력 상세 모달 + 내용 블록 + 참여자 스택 컴포넌트.
 *
 * 연관 파일:
 *   - SupportHistoryPage.jsx : 목록 행 클릭 시 open 상태로 전달
 *   - supportHistory.js : formatDateTimeFull, formatDuration, getHistoryParticipants, getHistoryTimelineRows
 *   - components/Dashboard.jsx : TypeTag
 *   - components/Icon.jsx : 아이콘
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { TypeTag } from '../../../components/Dashboard.jsx';
import {
  formatDateTimeFull,
  formatDuration,
  getHistoryParticipants,
  getHistoryTimelineRows,
} from '../../../supportHistory.js';
import { useUser } from '../../../contexts/UserContext.js';
import { deleteHistory } from '../api/historyApi.js';

export function HistoryDetailModal({ item, onClose }) {
  const me = useUser();
  const { history, status, prio } = item;
  const statusLabel  = { draft: '초안', progress: '진행중', done: '완료', review: '검토중' }[status];
  const customerColor = history.customerColor || '#888';
  const participants  = getHistoryParticipants(history);
  const timeline = getHistoryTimelineRows(history);

  const isAuthor = me && history.createdBy === me.id;
  const isAdmin = me && (me.role === 'admin' || me.rbacRoleLabel?.includes('관리'));
  const canDelete = isAdmin || isAuthor;

  const [isDeleting, setIsDeleting] = React.useState(false);

  async function handleDelete() {
    if (!window.confirm('이 지원이력을 정말 삭제하시겠습니까?')) return;
    setIsDeleting(true);
    try {
      await deleteHistory(history.id);
      onClose(true);
    } catch (err: any) {
      alert('삭제 중 오류가 발생했습니다: ' + (err.message || '알 수 없는 오류'));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 760, width: '94vw' }}>

        <div className="modal-h">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <div className="avatar lg" style={{ background: customerColor, borderRadius: 10, flexShrink: 0, fontWeight: 700, fontSize: 18 }}>
              {history.customer[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-1)' }}>{history.customer}</span>
                <TypeTag type={history.type}/>
                <span className={`hist-status-badge ${status}`}>{statusLabel}</span>
                <span className={`hist-priority ${prio}`}>{prio.toUpperCase()}</span>
              </div>
              <div className="text-3" style={{ fontSize: 12, opacity: 0.8 }}>
                {history.service} · {history.date} · {history.id}
              </div>
            </div>
          </div>
          <button className="btn icon ghost" onClick={() => onClose()}><Icon name="x" size={18}/></button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px' }}>
          {history.summary && (
            <div style={{
              background: 'var(--bg-sub)', 
              borderRadius: '12px', 
              padding: '14px 18px',
              marginBottom: 20, 
              fontSize: 14, 
              color: 'var(--text-2)',
              border: '1px solid var(--border)',
              borderLeft: '4px solid var(--brand-500)',
              lineHeight: 1.6
            }}>
              {history.summary}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
            <aside style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <section>
                <div className="hist-modal-section-label" style={{ marginBottom: 8, fontWeight: 600, fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>시간 기록</div>
                <div style={{ background: 'var(--bg-sub)', borderRadius: '12px', padding: '12px 16px', border: '1px solid var(--border)' }}>
                  {timeline.map(tl => (
                    <div key={tl.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-sub)', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-3)' }}>{tl.label}</span>
                      <span style={{ fontWeight: 500, color: 'var(--text-2)' }}>{formatDateTimeFull(tl.value)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 2px', fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>총 지원시간</span>
                    <span style={{ fontWeight: 800, color: 'var(--brand-500)' }}>{formatDuration(history.actualMinutes)}</span>
                  </div>
                </div>
              </section>

              <section>
                <div className="hist-modal-section-label" style={{ marginBottom: 8, fontWeight: 600, fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>지원 정보</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-sub)', borderRadius: '12px', padding: '12px 16px', border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 4 }}>지원 방법</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className="tag routine sm">{history.method || (history.supportMode === 'onsite' ? '방문' : '원격')}</span>
                      <span className="text-3" style={{ fontSize: 10, display: 'flex', alignItems: 'center' }}>
                        {history.supportMode === 'onsite' ? '출발~복귀 포함' : '순수 지원시간'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 4 }}>지원 구간</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{history.displayRange}</div>
                  </div>
                </div>
              </section>
            </aside>

            <main style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <HistDetailBlock label="작업 내용" text={history.workDetail || history.summary}/>
              <HistDetailBlock label="발견 사항" text={history.finding || '운영 중 확인된 특이사항이 없습니다.'}/>
              <HistDetailBlock label="조치 사항" text={history.action || '후속 조치 없이 종료했습니다.'}/>
            </main>
          </div>

          {participants.length > 0 && (
            <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
              <div className="hist-modal-section-label" style={{ marginBottom: 12, fontWeight: 600, fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>참여 엔지니어</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {participants.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--bg-sub)', borderRadius: '12px', border: '1px solid var(--border)', transition: 'all 0.2s' }}>
                    <div className="avatar sm" style={{ background: p.color, width: 28, height: 28, fontSize: 11, fontWeight: 700 }}>{p.initial}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{p.name}</div>
                      {p.isManager && <div style={{ fontSize: 10, color: 'var(--brand-500)', fontWeight: 700 }}>담당</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {canDelete && (
            <button
              className="btn ghost"
              style={{ color: 'var(--err)', marginRight: 'auto' }}
              onClick={handleDelete}
              disabled={isDeleting}
            >
              <Icon name="trash" size={14}/> {isDeleting ? '삭제 중...' : '이력 삭제'}
            </button>
          )}
          <button className="btn ghost" onClick={() => onClose()}>닫기</button>
        </div>
      </div>
    </div>
  );
}

export function HistDetailBlock({ label, text }) {
  return (
    <div>
      <div className="hist-modal-section-label">{label}</div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{text}</p>
    </div>
  );
}

export function ParticipantStack({ participants, compact = false }) {
  if (!participants || participants.length === 0) return <span className="text-3">미지정</span>;
  return (
    <div className={'hist-participants' + (compact ? ' compact' : '')}>
      {participants.map(participant => (
        <span key={participant.id} className="hist-participant-pill">
          <span className="avatar" style={{ background: participant.color, width: 18, height: 18, fontSize: 10 }}>{participant.initial}</span>
          <span>{participant.name}</span>
        </span>
      ))}
    </div>
  );
}
