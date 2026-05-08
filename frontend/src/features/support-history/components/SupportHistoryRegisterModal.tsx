/**
 * 파일: frontend/src/features/support-history/components/SupportHistoryRegisterModal.jsx
 * 역할: 지원이력 등록 모달. 방문/원격 구분, 참여 엔지니어 선택, 가동률 미리보기.
 *
 * 연관 파일:
 *   - SupportHistoryPage.jsx : showRegister 상태로 열림, engineers/customers prop 전달
 *   - supportHistory.js : createSupportHistoryRecord, formatDuration
 *   - components/common/CustomerCombobox.jsx : 고객사 선택
 *   - components/Icon.jsx : 아이콘
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { CustomerCombobox } from '../../../components/common/CustomerCombobox.jsx';
import { createSupportHistoryRecord, formatDuration } from '../../../supportHistory.js';
import { useUser } from '../../../contexts/UserContext.js';

export function SupportHistoryRegisterModal({ engineers, customers, onClose, onSave }) {
  const me = useUser();
  const defaultManager = engineers[0] || null;
  const firstCustomer  = customers[0] || null;

  const [draft, setDraft] = React.useState({
    customerId:        firstCustomer?.value || '',
    customer:          firstCustomer?.label || '',
    service:           'Oracle 19c',
    type:              'tech',
    supportMode:       'remote',
    managerId:         defaultManager?.id || '',
    participants:      defaultManager ? [defaultManager.id] : [],
    summary:           '',
    workDetail:        '',
    finding:           '',
    action:            '',
    departureAt:       '2026-05-11T09:10',
    supportStartedAt:  '2026-05-11T10:00',
    supportEndedAt:    '2026-05-11T11:30',
    returnAt:          '2026-05-11T12:20',
  });

  const selectedParticipants = engineers.filter(e => draft.participants.includes(e.id));
  const manager = engineers.find(e => e.id === draft.managerId) || selectedParticipants[0] || null;
  const preview = createSupportHistoryRecord({
    customer:     draft.customer,
    service:      draft.service,
    type:         draft.type,
    supportMode:  draft.supportMode,
    manager,
    participants: selectedParticipants,
    summary:      draft.summary || '신규 지원 이력',
    workDetail:   draft.workDetail || draft.summary,
    finding:      draft.finding,
    action:       draft.action,
    timeline: draft.supportMode === 'onsite'
      ? {
          departureAt:      draft.departureAt,
          supportStartedAt: draft.supportStartedAt,
          supportEndedAt:   draft.supportEndedAt,
          returnAt:         draft.returnAt,
        }
      : {
          supportStartedAt: draft.supportStartedAt,
          supportEndedAt:   draft.supportEndedAt,
        },
  });

  const requiredTimes = draft.supportMode === 'onsite'
    ? [draft.departureAt, draft.supportStartedAt, draft.supportEndedAt, draft.returnAt]
    : [draft.supportStartedAt, draft.supportEndedAt];
  const canSave = draft.customerId && draft.service.trim() && draft.summary.trim()
    && manager && selectedParticipants.length > 0 && requiredTimes.every(Boolean);

  function updateField(field, value) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  function selectCustomer(value) {
    const opt = (customers || []).find(c => String(c.value) === String(value));
    setDraft(d => ({ ...d, customerId: value || '', customer: opt?.label || '' }));
  }

  function toggleParticipant(engineerId) {
    setDraft(current => {
      const exists           = current.participants.includes(engineerId);
      const nextParticipants = exists
        ? current.participants.filter(id => id !== engineerId)
        : [...current.participants, engineerId];
      const nextManagerId    = nextParticipants.includes(current.managerId)
        ? current.managerId
        : nextParticipants[0] || '';
      return { ...current, participants: nextParticipants, managerId: nextManagerId };
    });
  }

  function handleSave() {
    if (!canSave) return;
    onSave({
      ...preview,
      customerId: draft.customerId,
      managerId:  manager?.id,
      createdBy:  me?.id,
    });
  }

  return (
    <div className="modal-backdrop">
      <div className="modal lg" onClick={event => event.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">지원이력 등록</div>
            <div className="text-3" style={{ fontSize: 12, marginTop: 4, color: 'var(--text-3)' }}>방문은 출발~복귀, 원격은 지원시작~종료 기준으로 실제 지원시간을 계산합니다.</div>
          </div>
          <button className="btn icon ghost" onClick={onClose}><Icon name="x" size={18}/></button>
        </div>

        <div className="modal-body" style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24 }}>
          <div className="scroll" style={{ maxHeight: '70vh', paddingRight: 8 }}>
            <div style={{ display: 'grid', gap: 20 }}>
              {/* 기본 정보 섹션 */}
              <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '16px', background: 'var(--bg-sub)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <label className="form-label">
                  <span>고객사 *</span>
                  <CustomerCombobox
                    value={draft.customerId || null}
                    onChange={selectCustomer}
                    options={customers}
                    placeholder="고객사 선택"
                  />
                </label>
                <label className="form-label">
                  <span>서비스 대상</span>
                  <input className="input" value={draft.service} onChange={event => updateField('service', event.target.value)} placeholder="예: Oracle 19c"/>
                </label>
                <label className="form-label">
                  <span>지원 유형</span>
                  <select className="input" value={draft.type} onChange={event => updateField('type', event.target.value)}>
                    <option value="routine">정기점검</option>
                    <option value="tech">기술지원</option>
                    <option value="incident">장애처리</option>
                  </select>
                </label>
                <label className="form-label">
                  <span>지원 방식</span>
                  <select className="input" value={draft.supportMode} onChange={event => updateField('supportMode', event.target.value)}>
                    <option value="remote">원격 (Remote)</option>
                    <option value="onsite">방문 (On-site)</option>
                  </select>
                </label>
              </section>

              {/* 시간 설정 섹션 */}
              <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '16px', background: 'var(--bg-sub)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                {draft.supportMode === 'onsite' ? (
                  <>
                    <label className="form-label">
                      <span>출발 시간</span>
                      <input className="input" type="datetime-local" value={draft.departureAt} onChange={event => updateField('departureAt', event.target.value)}/>
                    </label>
                    <label className="form-label">
                      <span>지원 시작</span>
                      <input className="input" type="datetime-local" value={draft.supportStartedAt} onChange={event => updateField('supportStartedAt', event.target.value)}/>
                    </label>
                    <label className="form-label">
                      <span>지원 종료</span>
                      <input className="input" type="datetime-local" value={draft.supportEndedAt} onChange={event => updateField('supportEndedAt', event.target.value)}/>
                    </label>
                    <label className="form-label">
                      <span>복귀 완료</span>
                      <input className="input" type="datetime-local" value={draft.returnAt} onChange={event => updateField('returnAt', event.target.value)}/>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="form-label">
                      <span>지원 시작</span>
                      <input className="input" type="datetime-local" value={draft.supportStartedAt} onChange={event => updateField('supportStartedAt', event.target.value)}/>
                    </label>
                    <label className="form-label">
                      <span>지원 종료</span>
                      <input className="input" type="datetime-local" value={draft.supportEndedAt} onChange={event => updateField('supportEndedAt', event.target.value)}/>
                    </label>
                  </>
                )}
              </section>

              {/* 담당자 섹션 */}
              <section style={{ padding: '16px', background: 'var(--bg-sub)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <label className="form-label">
                    <span>메인 담당자</span>
                    <select className="input" value={draft.managerId} onChange={event => updateField('managerId', event.target.value)}>
                      {selectedParticipants.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </label>
                </div>
                <div className="form-label">
                  <span style={{ marginBottom: 12, display: 'block' }}>참여 엔지니어 선택</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {engineers.map(e => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => toggleParticipant(e.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                          borderRadius: '20px', border: '1px solid var(--border)',
                          background: draft.participants.includes(e.id) ? 'var(--brand-50)' : 'var(--bg-1)',
                          borderColor: draft.participants.includes(e.id) ? 'var(--brand-300)' : 'var(--border)',
                          cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >
                        <span className="avatar" style={{ background: e.color, width: 22, height: 22, fontSize: 10, fontWeight: 700 }}>{e.initial}</span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: draft.participants.includes(e.id) ? 'var(--brand-700)' : 'var(--text-2)' }}>{e.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* 지원 내용 섹션 */}
              <section style={{ display: 'grid', gap: 16 }}>
                <label className="form-label">
                  <span>작업 요약 (Summary) *</span>
                  <input className="input" value={draft.summary} onChange={event => updateField('summary', event.target.value)} placeholder="예: 정기점검 및 보안 패치 적용"/>
                </label>
                <label className="form-label">
                  <span>세부 작업 내용</span>
                  <textarea className="input" style={{ height: 120, resize: 'vertical' }} value={draft.workDetail} onChange={event => updateField('workDetail', event.target.value)} placeholder="수행한 작업을 상세히 기록하세요."/>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <label className="form-label">
                    <span>주요 발견 사항 (Findings)</span>
                    <textarea className="input" style={{ height: 80, resize: 'vertical' }} value={draft.finding} onChange={event => updateField('finding', event.target.value)}/>
                  </label>
                  <label className="form-label">
                    <span>조치 및 권고 (Actions)</span>
                    <textarea className="input" style={{ height: 80, resize: 'vertical' }} value={draft.action} onChange={event => updateField('action', event.target.value)}/>
                  </label>
                </div>
              </section>
            </div>
          </div>

          <aside>
            <div style={{ position: 'sticky', top: 0, padding: '20px', background: 'var(--brand-500)', borderRadius: '16px', color: '#fff', boxShadow: '0 10px 30px -10px var(--brand-500)' }}>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4, fontWeight: 600 }}>가동률 반영 시간 (Preview)</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>{formatDuration(preview.actualMinutes)}</div>
              
              <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 8 }}>
                  <span style={{ opacity: 0.7 }}>기준 날짜</span>
                  <span style={{ fontWeight: 600 }}>{preview.date}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 8 }}>
                  <span style={{ opacity: 0.7 }}>지원 구간</span>
                  <span style={{ fontWeight: 600, textAlign: 'right' }}>{preview.displayRange}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ opacity: 0.7 }}>참여 인원</span>
                  <span style={{ fontWeight: 600 }}>{selectedParticipants.length}명</span>
                </div>
              </div>
              
              <div style={{ marginTop: 24, padding: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: 11, lineHeight: 1.5 }}>
                <Icon name="info" size={12} style={{ marginRight: 6 }}/>
                가동률은 실제 지원시간 전체를 기준으로 집계되며, 대시보드 통계에 즉시 반영됩니다.
              </div>
            </div>
          </aside>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={handleSave} disabled={!canSave} style={{ minWidth: 100 }}>
            등록하기
          </button>
        </div>
      </div>
    </div>
  );
}
