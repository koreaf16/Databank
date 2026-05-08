/**
 * 파일: frontend/src/features/customers/components/CustomerMgmtPage.jsx
 * 역할: 고객사 목록 조회/검색/등록/수정 화면. nav === 'cust' 활성 시 렌더.
 *       기존 components/CustomerMgmt.jsx를 features 구조로 이전, window.* 의존 제거.
 *
 * 연관 파일:
 *   - ../api/customersApi.js            : 백엔드 호출
 *   - shared/api/apiClient.js           : fetch + envelope 파싱
 *
 * Props:
 *   - embedded: boolean — SettingsShell 내 탭으로 삽입될 때 true (헤더 숨김)
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  addAssignment,
  removeAssignment,
} from '../api/customersApi.js';
import { getUsers } from '../../organization/api/orgApi.js';
import { UserCombobox } from '../../../components/common/UserCombobox.js';

const EMPTY_FORM = { customerMain: '', aliases: [], enabled: true, assignments: [] };
const PAGE_SIZE = 20;

export function CustomerMgmtPage({ embedded = false }) {
  const [customers, setCustomers] = React.useState([]);
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [aliasInput, setAliasInput] = React.useState('');
  const [page, setPage] = React.useState(1);

  // 배정용 상태
  const [assignUserId, setAssignUserId] = React.useState<number | null>(null);
  const [assignRole, setAssignRole] = React.useState('secondary');

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await getCustomers(true);
      setCustomers(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      setError(err.message || '고객사 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = React.useCallback(async () => {
    try {
      const data = await getUsers();
      setUsers(data || []);
    } catch (err) {
      console.error('사용자 목록을 불러오지 못했습니다.', err);
    }
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  const filtered = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return customers;
    return customers.filter(row => {
      const source = [row.customerMain, ...(row.aliases || [])]
        .filter(Boolean).join(' ').toLowerCase();
      return source.includes(keyword);
    });
  }, [customers, search]);

  React.useEffect(() => setPage(1), [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setAliasInput('');
    setAssignUserId(null);
    setAssignRole('secondary');
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setAliasInput('');
    setModalOpen(true);
    loadUsers();
  }

  async function openEdit(row) {
    setLoading(true);
    try {
      const full = await getCustomer(row.id);
      setEditing(full);
      setForm({
        customerMain: full.customerMain || '',
        aliases: Array.isArray(full.aliases) ? full.aliases.map(a => a.name || a) : [],
        enabled: Number(full.enabled) !== 0,
        assignments: full.assignments || [],
      });
      setAliasInput('');
      setModalOpen(true);
      loadUsers();
    } catch (err: any) {
      alert(err.message || '고객사 상세 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  function addAliasToForm() {
    const name = aliasInput.trim();
    if (!name || form.aliases.includes(name)) return;
    setForm(prev => ({ ...prev, aliases: [...prev.aliases, name] }));
    setAliasInput('');
  }

  function removeAliasFromForm(index) {
    setForm(prev => ({ ...prev, aliases: prev.aliases.filter((_, i) => i !== index) }));
  }

  async function onAddAssignment() {
    if (!assignUserId || !editing) return;
    setSaving(true);
    try {
      await addAssignment(editing.id, { userId: assignUserId, role: assignRole });
      const full = await getCustomer(editing.id);
      setForm(prev => ({ ...prev, assignments: full.assignments }));
      setAssignUserId(null);
    } catch (err: any) {
      alert(err.message || '담당자 추가에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function onRemoveAssignment(aid) {
    if (!editing || !window.confirm('담당자 배정을 해제하시겠습니까?')) return;
    setSaving(true);
    try {
      await removeAssignment(editing.id, aid);
      const full = await getCustomer(editing.id);
      setForm(prev => ({ ...prev, assignments: full.assignments }));
    } catch (err: any) {
      alert(err.message || '담당자 해제에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function submitForm(event) {
    event.preventDefault();
    if (!form.customerMain.trim()) return;
    setSaving(true);
    setError('');
    const payload = {
      customerMain: form.customerMain.trim(),
      aliases: form.aliases,
      enabled: Boolean(form.enabled),
    };
    try {
      if (editing) {
        await updateCustomer(editing.id, payload);
      } else {
        await createCustomer(payload);
      }
      await loadData();
      closeModal();
    } catch (err: any) {
      setError(err.message || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function disableCustomer(row) {
    if (!window.confirm(`"${row.customerMain}" 고객사를 비활성화 하시겠습니까?`)) return;
    setSaving(true);
    setError('');
    try {
      await deleteCustomer(row.id);
      await loadData();
    } catch (err: any) {
      setError(err.message || '비활성화에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const userOptions = users.map(u => ({
    value: u.id,
    label: u.name,
    subLabel: u.positionName || u.deptName,
  }));

  const shellStyle = embedded
    ? { height: '100%', display: 'flex', flexDirection: 'column' }
    : { height: '100%' };

  return (
    <div className={embedded ? '' : 'page-pad scroll'} style={shellStyle}>
      {!embedded && (
        <div className="page-h">
          <div>
            <div className="page-eyebrow">Customer Registry</div>
            <h1 className="page-title">고객사 관리</h1>
          </div>
        </div>
      )}

      <div className="cust-mgmt">
        <div className="cust-mgmt-head">
          <span className="cust-mgmt-count">
            <b>{customers.length}</b> customers
          </span>
          <div style={{ flex: 1 }}/>
          <div className="cust-search-wrap">
            <Icon name="search" size={13}/>
            <input
              className="cust-search-input"
              placeholder="고객사명 / 별칭 검색"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="btn" onClick={loadData} disabled={loading || saving}>
            <Icon name="refresh" size={13}/> Refresh
          </button>
          <button className="btn primary" onClick={openCreate} disabled={saving}>
            <Icon name="plus" size={13}/> Add
          </button>
        </div>

        {error && (
          <div className="card card-pad" style={{ color: 'var(--err)' }}>{error}</div>
        )}

        <div className="card" style={{ overflow: 'hidden' }}>
          {loading && !modalOpen ? (
            <div className="cust-empty">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="cust-empty">고객사가 없습니다.</div>
          ) : (
            <table className="hist-table">
              <thead>
                <tr>
                  <th>고객사명</th>
                  <th>별칭</th>
                  <th style={{ width: 100 }}>상태</th>
                  <th style={{ width: 104 }}/>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(row => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.customerMain}</td>
                    <td className="text-2">
                      {(row.aliases || []).length === 0
                        ? <span style={{ color: 'var(--text-3)' }}>-</span>
                        : (row.aliases || []).map((alias, i) => (
                          <span key={i} className="tag muted xs" style={{ marginRight: 4 }}>
                            {typeof alias === 'object' ? alias.name : alias}
                          </span>
                        ))
                      }
                    </td>
                    <td>
                      {Number(row.enabled) === 0 ? (
                        <span className="tag muted">disabled</span>
                      ) : (
                        <span className="tag install">
                          <span className="dot ok"/> enabled
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn icon ghost sm"
                          title="편집"
                          onClick={() => openEdit(row)}
                          disabled={saving}
                        >
                          <Icon name="edit" size={12}/>
                        </button>
                        <button
                          className="btn icon ghost sm"
                          title="비활성화"
                          onClick={() => disableCustomer(row)}
                          disabled={saving || Number(row.enabled) === 0}
                        >
                          <Icon name="trash" size={12}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {filtered.length > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
              <button
                className="btn ghost sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                이전
              </button>
              <span className="text-3" style={{ fontSize: 13 }}>{page} / {totalPages}</span>
              <button
                className="btn ghost sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                다음
              </button>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="modal-backdrop">
          <form
            className="modal"
            style={{ width: 560 }}
            onClick={e => e.stopPropagation()}
            onSubmit={submitForm}
          >
            <div className="modal-h">
              <div className="modal-title">{editing ? '고객사 편집' : '고객사 추가'}</div>
              <button type="button" className="btn icon ghost" onClick={closeModal}>
                <Icon name="x" size={16}/>
              </button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 20, padding: '20px 24px' }}>
              <div style={{ display: 'grid', gap: 16 }}>
                <label className="form-label">
                  <span>고객사명 *</span>
                  <input
                    className="input"
                    value={form.customerMain}
                    onChange={e => setForm(prev => ({ ...prev, customerMain: e.target.value }))}
                    placeholder="공식 고객사명 입력"
                    autoFocus
                    required
                  />
                </label>

                <div className="form-label">
                  <span>별칭 (Search Aliases)</span>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      placeholder="검색에 사용될 별칭 입력..."
                      value={aliasInput}
                      onChange={e => setAliasInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAliasToForm(); } }}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={addAliasToForm}
                      disabled={!aliasInput.trim()}
                    >
                      <Icon name="plus" size={13}/> 추가
                    </button>
                  </div>
                  {form.aliases.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {form.aliases.map((alias, i) => (
                        <span
                          key={i}
                          className="tag muted xs"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: '6px', background: 'var(--bg-sub)', border: '1px solid var(--border)' }}
                        >
                          {alias}
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: 'var(--text-4)' }}
                            onClick={() => removeAliasFromForm(i)}
                          >
                            <Icon name="x" size={12}/>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {editing && (
                <div style={{ padding: '16px', background: 'var(--bg-sub)', borderRadius: '12px', border: '1px solid var(--border)', display: 'grid', gap: 16 }}>
                  <div className="form-label">
                    <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-3)', marginBottom: 10, display: 'block' }}>담당자 배정 관리</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 70px', gap: 8, marginBottom: 12 }}>
                      <UserCombobox
                        value={assignUserId}
                        onChange={(v) => setAssignUserId(v as number)}
                        options={userOptions}
                        placeholder="사용자 검색..."
                      />
                      <select
                        className="input"
                        style={{ height: '36px', fontSize: '13px' }}
                        value={assignRole}
                        onChange={e => setAssignRole(e.target.value)}
                      >
                        <option value="primary">Primary</option>
                        <option value="secondary">Secondary</option>
                        <option value="sales">Sales</option>
                      </select>
                      <button
                        type="button"
                        className="btn primary"
                        style={{ height: '36px' }}
                        disabled={!assignUserId || saving}
                        onClick={onAddAssignment}
                      >
                        추가
                      </button>
                    </div>

                    <div style={{ display: 'grid', gap: 6 }}>
                      {(form.assignments || []).length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-4)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: '8px' }}>배정된 담당자가 없습니다.</div>
                      ) : (
                        form.assignments.map((a: any) => (
                          <div
                            key={a.assignmentId}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 12px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{a.userName}</div>
                              <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{a.positionName || '팀원'}</div>
                            </div>
                            <span className={`tag sm ${a.role === 'primary' ? 'routine' : 'muted'}`} style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: 700 }}>
                              {a.role}
                            </span>
                            <button
                              type="button"
                              className="btn icon ghost sm"
                              onClick={() => onRemoveAssignment(a.assignmentId)}
                              disabled={saving}
                            >
                              <Icon name="x" size={14}/>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              <label className="org-check" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(form.enabled)}
                  onChange={e => setForm(prev => ({ ...prev, enabled: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: 'var(--brand-500)' }}
                />
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>고객사 계정 활성화 상태 유지</span>
              </label>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={closeModal} disabled={saving}>
                취소
              </button>
              <button type="submit" className="btn primary" disabled={saving || !form.customerMain.trim()}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

