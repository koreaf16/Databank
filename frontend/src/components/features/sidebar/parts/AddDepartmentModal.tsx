/**
 * @module components/features/sidebar/parts/AddDepartmentModal
 * @description 다른 팀 채널 즐겨찾기 추가 모달
 * @usage <AddDepartmentModal allTeams={[]} myTeamId="1" deptMap={{}} allChannels={[]} pinnedTeams={[]} onClose={fn} onAdd={teamId => fn(teamId)}/>
 * @related DepartmentChannels.jsx
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { Icon } from '../../../Icon.jsx';

export function AddDepartmentModal({ allTeams, myTeamId, deptMap, allChannels, pinnedTeams, onClose, onAdd }) {
  const addableTeams = (allTeams || []).filter(
    t => String(t.id) !== myTeamId && !pinnedTeams.includes(String(t.id)),
  );

  return ReactDOM.createPortal(
    <div className="modal-backdrop">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <div className="modal-h">
          <div>
            <div className="modal-title">팀 채널 추가</div>
            <div className="text-3" style={{ fontSize: 12 }}>채널 패널에 다른 팀 채널을 추가합니다.</div>
          </div>
          <button className="btn icon ghost" onClick={onClose}>
            <Icon name="x" size={16}/>
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px' }}>
          {addableTeams.length === 0 ? (
            <div style={{ color: 'var(--text-4)', textAlign: 'center', padding: '40px 0', background: 'var(--bg-sub)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
              <Icon name="check" size={24} style={{ marginBottom: 8, display: 'block', margin: '0 auto', opacity: 0.5 }}/>
              <div style={{ fontSize: 13 }}>모든 팀 채널이 이미 추가되어 있습니다.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {addableTeams.map(team => {
                const channels = deptMap[String(team.id)] || [];
                const unreadTotal = channels.reduce((n, ch) => n + (ch.unread || 0), 0);
                return (
                  <button
                    key={team.id}
                    className="cust-pick"
                    onClick={() => onAdd(String(team.id))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--border)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span
                      className="sb-ch-avatar"
                      style={{ background: team.color, width: 32, height: 32, borderRadius: 8, fontSize: 12, fontWeight: 700 }}
                    >
                      {team.name[0]}
                    </span>
                    <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{team.name}</div>
                      <div className="text-3" style={{ fontSize: 11, opacity: 0.7 }}>
                        채널 {channels.length}개
                        {unreadTotal > 0 && (
                          <span style={{ marginLeft: 6, color: 'var(--err)', fontWeight: 600 }}>
                            · 미읽음 {unreadTotal}
                          </span>
                        )}
                      </div>
                    </div>
                    <Icon name="plus" size={14} className="text-4"/>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose} style={{ width: '100%' }}>닫기</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
