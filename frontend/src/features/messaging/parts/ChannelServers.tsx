/**
 * 파일: frontend/src/features/messaging/parts/ChannelServers.tsx
 * 역할: 고객사 채널 안의 서버리스트와 서버별 정/부 엔지니어 배정을 관리한다.
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { UserCombobox } from '../../../components/common/UserCombobox.js';
import { getUsers } from '../../organization/api/orgApi.js';
import {
  getChannelServers,
  createChannelServer,
  updateChannelServer,
  deleteChannelServer,
} from '../api/messagingApi.js';

const EMPTY_FORM = {
  serverName: '',
  platform: '',
  productName: '',
  status: 'active',
  primaryEngineerId: null,
  secondaryEngineerId: null,
  memo: '',
};

const PLATFORM_OPTIONS = ['Linux', 'Windows', 'Unix', 'AIX', 'Solaris', '기타'];
const PRODUCT_OPTIONS = ['Oracle', 'WebLogic', 'PostgreSQL', 'MySQL', 'Tibero', 'JEUS', 'Redis', 'MongoDB', '기타'];

const STATUS_LABEL: Record<string, string> = {
  active: '운영중',
  warning: '주의',
  incident: '장애',
  paused: '중지',
};

const STATUS_CLASS: Record<string, string> = {
  active: 'install',
  warning: 'tech',
  incident: 'incident',
  paused: 'muted',
};

function engineerLabel(server: any, role: 'primary' | 'secondary') {
  const name = role === 'primary' ? server.primaryEngineerName : server.secondaryEngineerName;
  const position = role === 'primary' ? server.primaryEngineerPosition : server.secondaryEngineerPosition;
  if (!name) return <span className="text-4">-</span>;
  return (
    <span className="server-engineer">
      <b>{name}</b>
      {position && <span>{position}</span>}
    </span>
  );
}

export function ChannelServers({
  channel,
  canCreateServer = false,
  canAssignEngineer = false,
  createToken = 0,
  onCountChange,
}: any) {
  const [servers, setServers] = React.useState<any[]>([]);
  const [users, setUsers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<any>(null);
  const [form, setForm] = React.useState<any>(EMPTY_FORM);

  const loadServers = React.useCallback(async () => {
    if (!channel?.id) return;
    setLoading(true);
    setError('');
    try {
      const rows = await getChannelServers(channel.id);
      const next = Array.isArray(rows) ? rows : [];
      setServers(next);
      onCountChange?.(next.length);
    } catch (err: any) {
      setError(err.message || '서버리스트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [channel?.id, onCountChange]);

  React.useEffect(() => {
    loadServers();
  }, [loadServers]);

  React.useEffect(() => {
    if (!canAssignEngineer) return;
    getUsers()
      .then(rows => setUsers(Array.isArray(rows) ? rows : []))
      .catch(() => setUsers([]));
  }, [canAssignEngineer]);

  React.useEffect(() => {
    if (createToken > 0 && canCreateServer) openCreate();
  }, [createToken]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(server: any) {
    setEditing(server);
    setForm({
      serverName: server.serverName || '',
      platform: server.platform || '',
      productName: server.productName || '',
      status: server.status || 'active',
      primaryEngineerId: server.primaryEngineerId ?? null,
      secondaryEngineerId: server.secondaryEngineerId ?? null,
      memo: server.memo || '',
    });
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function saveServer(event: React.FormEvent) {
    event.preventDefault();
    if (!form.serverName.trim() || !form.productName.trim()) return;
    if (form.primaryEngineerId && form.secondaryEngineerId && form.primaryEngineerId === form.secondaryEngineerId) {
      alert('정 엔지니어와 부 엔지니어는 서로 달라야 합니다.');
      return;
    }

    const payload: any = {
      serverName: form.serverName.trim(),
      platform: form.platform.trim(),
      productName: form.productName.trim(),
      status: form.status,
      memo: form.memo.trim(),
    };
    if (canAssignEngineer) {
      payload.primaryEngineerId = form.primaryEngineerId;
      payload.secondaryEngineerId = form.secondaryEngineerId;
    }

    setSaving(true);
    try {
      if (editing) await updateChannelServer(channel.id, editing.id, payload);
      else await createChannelServer(channel.id, payload);
      await loadServers();
      closeModal();
    } catch (err: any) {
      alert(err.message || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function removeServer(server: any) {
    if (!window.confirm(`"${server.serverName}" 서버를 목록에서 제거하시겠습니까?`)) return;
    setSaving(true);
    try {
      await deleteChannelServer(channel.id, server.id);
      await loadServers();
    } catch (err: any) {
      alert(err.message || '삭제에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const userOptions = users.map((u: any) => ({
    value: u.id,
    label: u.name,
    subLabel: u.positionName || u.deptName,
  }));

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter((server: any) =>
      [server.serverName, server.platform, server.productName, server.primaryEngineerName, server.secondaryEngineerName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [servers, search]);

  return (
    <div className="page-pad ws-page scroll" style={{ height: '100%' }}>
      <div className="channel-page-head">
        <div>
          <span className="channel-page-kicker">Server List</span>
          <h3>서버리스트</h3>
          <p className="text-3">서버가 이 채널의 업무 단위입니다. 서버별 정/부 엔지니어를 지정합니다.</p>
        </div>
        <div className="channel-page-actions">
          <div className="server-search">
            <Icon name="search" size={13}/>
            <input
              className="input sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="서버명 / 플랫폼 / 제품명 검색"
            />
          </div>
          <button className="btn" onClick={loadServers} disabled={loading || saving}>
            <Icon name="refresh" size={13}/> 새로고침
          </button>
          {canCreateServer && (
            <button className="btn primary" onClick={openCreate} disabled={saving}>
              <Icon name="plus" size={13}/> 서버
            </button>
          )}
        </div>
      </div>

      {error && <div className="card card-pad" style={{ color: 'var(--err)' }}>{error}</div>}

      <div className="card server-list-card">
        {loading ? (
          <div className="server-empty">서버리스트를 불러오는 중입니다.</div>
        ) : filtered.length === 0 ? (
          <div className="server-empty">등록된 서버가 없습니다.</div>
        ) : (
          <table className="hist-table server-table">
            <thead>
              <tr>
                <th>서버명</th>
                <th style={{ width: 130 }}>플랫폼</th>
                <th style={{ width: 150 }}>제품명</th>
                <th style={{ width: 88 }}>상태</th>
                <th style={{ width: 150 }}>정 엔지니어</th>
                <th style={{ width: 150 }}>부 엔지니어</th>
                <th style={{ width: 84 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((server: any) => (
                <tr key={server.id} onClick={() => openEdit(server)}>
                  <td><b>{server.serverName}</b>{server.memo && <div className="text-3">{server.memo}</div>}</td>
                  <td>{server.platform || <span className="text-4">-</span>}</td>
                  <td>{server.productName}</td>
                  <td><span className={`tag xs ${STATUS_CLASS[server.status] || 'muted'}`}>{STATUS_LABEL[server.status] || server.status}</span></td>
                  <td>{engineerLabel(server, 'primary')}</td>
                  <td>{engineerLabel(server, 'secondary')}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="server-row-actions">
                      <button className="btn icon ghost sm" title="수정" onClick={() => openEdit(server)}>
                        <Icon name="edit" size={12}/>
                      </button>
                      {canCreateServer && (
                        <button className="btn icon ghost sm" title="삭제" onClick={() => removeServer(server)} disabled={saving}>
                          <Icon name="trash" size={12}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="modal-backdrop">
          <form className="modal server-modal" onSubmit={saveServer} onClick={e => e.stopPropagation()}>
            <div className="modal-h">
              <div className="modal-title">{editing ? '서버 수정' : '서버 등록'}</div>
              <button type="button" className="btn icon ghost" onClick={closeModal}>
                <Icon name="x" size={16}/>
              </button>
            </div>
            <div className="modal-body server-modal-body">
              <label className="form-label">
                <span>서버명 *</span>
                <input
                  className="input"
                  value={form.serverName}
                  onChange={e => setForm((prev: any) => ({ ...prev, serverName: e.target.value }))}
                  placeholder="예: WAS-01"
                  autoFocus
                  required
                />
              </label>
              <label className="form-label">
                <span>플랫폼</span>
                <input
                  className="input"
                  list="channel-server-platforms"
                  value={form.platform}
                  onChange={e => setForm((prev: any) => ({ ...prev, platform: e.target.value }))}
                  placeholder="예: Linux"
                />
                <datalist id="channel-server-platforms">
                  {PLATFORM_OPTIONS.map(v => <option key={v} value={v}/>)}
                </datalist>
              </label>
              <label className="form-label">
                <span>제품명 *</span>
                <input
                  className="input"
                  list="channel-server-products"
                  value={form.productName}
                  onChange={e => setForm((prev: any) => ({ ...prev, productName: e.target.value }))}
                  placeholder="예: Oracle"
                  required
                />
                <datalist id="channel-server-products">
                  {PRODUCT_OPTIONS.map(v => <option key={v} value={v}/>)}
                </datalist>
              </label>
              <label className="form-label">
                <span>상태</span>
                <select
                  className="input"
                  value={form.status}
                  onChange={e => setForm((prev: any) => ({ ...prev, status: e.target.value }))}
                >
                  <option value="active">운영중</option>
                  <option value="warning">주의</option>
                  <option value="incident">장애</option>
                  <option value="paused">중지</option>
                </select>
              </label>

              <label className="form-label">
                <span>정 엔지니어</span>
                <UserCombobox
                  value={form.primaryEngineerId}
                  onChange={v => setForm((prev: any) => ({ ...prev, primaryEngineerId: v }))}
                  options={userOptions}
                  placeholder="정 엔지니어 선택"
                  disabled={!canAssignEngineer}
                />
              </label>
              <label className="form-label">
                <span>부 엔지니어</span>
                <UserCombobox
                  value={form.secondaryEngineerId}
                  onChange={v => setForm((prev: any) => ({ ...prev, secondaryEngineerId: v }))}
                  options={userOptions}
                  placeholder="부 엔지니어 선택"
                  disabled={!canAssignEngineer}
                />
              </label>

              <label className="form-label server-form-wide">
                <span>메모</span>
                <textarea
                  className="input"
                  rows={3}
                  value={form.memo}
                  onChange={e => setForm((prev: any) => ({ ...prev, memo: e.target.value }))}
                  placeholder="서버 특이사항"
                />
              </label>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={closeModal} disabled={saving}>취소</button>
              <button type="submit" className="btn primary" disabled={saving || !form.serverName.trim() || !form.productName.trim()}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
