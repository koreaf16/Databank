/**
 * @module components/features/sidebar/parts/DepartmentChannels
 * @description 부서/팀별 채널 섹션. 내 팀 자동 표시 + 즐겨찾기 팀 + 전사 공용.
 * @usage <DepartmentChannels currentChannel={id} onChannel={fn}/>
 * @related ChannelPanel.jsx, AddDepartmentModal.jsx
 */
import React from 'react';
import { Icon } from '../../../Icon.jsx';
import { SidebarSection } from './SidebarSection.jsx';
import { AddDepartmentModal } from './AddDepartmentModal.jsx';
import { getChannels } from '../../../../features/messaging/api/messagingApi.js';
import { useMasterData } from '../../../../contexts/MasterDataContext.js';
import { useUser } from '../../../../contexts/UserContext.js';

const PINNED_KEY = 'db_pinned_teams';

function ChannelRow({ ch, currentChannel, onChannel, kind }) {
  const isActive = currentChannel === ch.id;
  const hasUnread = ch.unread > 0;
  const isCrit = ch.severity === 'crit';
  const isWarn = ch.severity === 'warn';

  return (
    <div className="sb-ch-row">
      <button
        className={`sb-ch${isActive ? ' on' : ''}${hasUnread ? ' unread' : ''}${isCrit ? ' urgent' : ''}`}
        onClick={() => onChannel({ ...ch, kind: kind || 'team' })}
        title={ch.topic || ch.name}
      >
        <span className={`sb-ch-prefix${isCrit ? ' sev-crit' : isWarn ? ' sev-warn' : ''}`}>
          {kind === 'announcement'
            ? <Icon name="megaphone" size={13}/>
            : '#'
          }
        </span>
        <span className="sb-ch-name">{ch.name}</span>
        {ch.mentioned && <span className="sb-ch-mention">@</span>}
        {hasUnread && !ch.mentioned && <span className="sb-badge sm">{ch.unread}</span>}
      </button>
    </div>
  );
}

export function DepartmentChannels({ currentChannel, onChannel }) {
  const [open, setOpen] = React.useState(true);
  const [showModal, setShowModal] = React.useState(false);
  const [allChannels, setAllChannels] = React.useState<any[]>([]);
  const [pinnedTeams, setPinnedTeams] = React.useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(PINNED_KEY) || '[]'); } catch { return []; }
  });

  const { departments } = useMasterData();
  const me = useUser();
  const myTeamId = me?.deptId ? String(me.deptId) : '';

  React.useEffect(() => {
    getChannels({ kind: 'team' })
      .then(rows => setAllChannels(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  // deptId → channel[]
  const deptMap = React.useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const ch of allChannels) {
      const key = ch.deptId != null ? String(ch.deptId) : '';
      if (!map[key]) map[key] = [];
      map[key].push(ch);
    }
    return map;
  }, [allChannels]);

  const myChannels = myTeamId ? (deptMap[myTeamId] || []) : [];
  const myDept = departments.find(d => String(d.id) === myTeamId);

  const pinnedSections = pinnedTeams
    .map(teamId => ({
      team: departments.find(d => String(d.id) === teamId),
      channels: deptMap[teamId] || [],
    }))
    .filter(s => s.team);

  const companyChannels = allChannels.filter(ch => !ch.deptId);

  function removeTeam(teamId: string) {
    const next = pinnedTeams.filter(id => id !== teamId);
    setPinnedTeams(next);
    localStorage.setItem(PINNED_KEY, JSON.stringify(next));
  }

  function addTeam(teamId: string) {
    const next = pinnedTeams.includes(teamId) ? pinnedTeams : [...pinnedTeams, teamId];
    setPinnedTeams(next);
    localStorage.setItem(PINNED_KEY, JSON.stringify(next));
  }

  const totalUnread =
    [...myChannels, ...pinnedSections.flatMap(s => s.channels)]
      .reduce((n, ch) => n + (ch.unread || 0), 0);

  return (
    <>
      <SidebarSection
        label="부서·공용 채널"
        open={open}
        onToggle={() => setOpen(v => !v)}
        meta={totalUnread > 0 ? totalUnread : null}
        action={
          <button className="sb-add" title="팀 채널 추가" onClick={() => setShowModal(true)}>
            <Icon name="plus" size={12}/>
          </button>
        }
      >
        {/* 내 팀 채널 */}
        {myChannels.length > 0 && (
          <>
            <div className="sb-grp-label" style={{ paddingLeft: 16 }}>
              {myDept?.name || '내 팀'}
            </div>
            {myChannels.map(ch => (
              <ChannelRow key={ch.id} ch={ch} currentChannel={currentChannel} onChannel={onChannel}/>
            ))}
          </>
        )}

        {/* 즐겨찾기 팀 채널들 */}
        {pinnedSections.map(({ team, channels }) => (
          <div key={team.id}>
            <div
              className="sb-grp-label"
              style={{ paddingLeft: 16, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span style={{ flex: 1 }}>{team.name}</span>
              <button
                className="sb-add"
                title="제거"
                onClick={() => removeTeam(String(team.id))}
                style={{ marginRight: 8 }}
              >
                <Icon name="x" size={10}/>
              </button>
            </div>
            {channels.map(ch => (
              <ChannelRow key={ch.id} ch={ch} currentChannel={currentChannel} onChannel={onChannel}/>
            ))}
          </div>
        ))}

        {/* 전사 공용 채널 */}
        {companyChannels.length > 0 && (
          <>
            <div className="sb-grp-label" style={{ paddingLeft: 16 }}>전사 공용</div>
            {companyChannels.map(ch => (
              <ChannelRow key={ch.id} ch={ch} currentChannel={currentChannel} onChannel={onChannel}/>
            ))}
          </>
        )}

      </SidebarSection>

      {showModal && (
        <AddDepartmentModal
          allTeams={departments}
          myTeamId={myTeamId}
          deptMap={deptMap}
          allChannels={allChannels}
          pinnedTeams={pinnedTeams}
          onClose={() => setShowModal(false)}
          onAdd={teamId => {
            addTeam(teamId);
            setShowModal(false);
          }}
        />
      )}
    </>
  );
}
