import React from 'react';
import { Icon } from '../../../Icon.jsx';
import { useMasterData } from '../../../../contexts/MasterDataContext.js';

function getCustomerName(customer) {
  return customer.customerMain || customer.customerName || customer.name || '';
}

export function AddCustomerModal({ existing = [], onClose, onAdd, busy = false }) {
  const { customers: allCustomers, groupTags } = useMasterData();
  const [query, setQuery] = React.useState('');
  const [mode, setMode] = React.useState('catalog');
  const [newName, setNewName] = React.useState('');
  const [newGroup, setNewGroup] = React.useState(groupTags[0] || 'IT');

  const existingIds = React.useMemo(
    () => new Set(existing.map(id => String(id))),
    [existing],
  );

  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allCustomers
      .filter(customer => !existingIds.has(String(customer.id)))
      .filter(customer => {
        if (!needle) return true;
        const name = getCustomerName(customer);
        const aliases = Array.isArray(customer.aliases) ? customer.aliases.join(' ') : '';
        return `${name} ${aliases} ${customer.group || ''}`.toLowerCase().includes(needle);
      })
      .slice(0, 30);
  }, [allCustomers, existingIds, query]);

  function createNewCustomer() {
    const name = newName.trim();
    if (!name || busy) return;
    onAdd({
      id: `new-${Date.now()}`,
      name,
      customerMain: name,
      initial: name[0],
      color: '#5b8eff',
      group: newGroup,
    });
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={event => event.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">고객사 채널 추가</div>
            <div className="text-3" style={{ fontSize: 12 }}>
              고객사 마스터에서 검색해 채널을 만들거나 기존 고객사 채널을 엽니다.
            </div>
          </div>
          <button className="btn icon ghost" onClick={onClose}>
            <Icon name="x" size={16}/>
          </button>
        </div>

        <div className="modal-tabs">
          <button className={`mtab${mode === 'catalog' ? ' on' : ''}`} onClick={() => setMode('catalog')}>
            기존 고객사
          </button>
          <button className={`mtab${mode === 'new' ? ' on' : ''}`} onClick={() => setMode('new')}>
            새 고객사
          </button>
        </div>

        <div className="modal-body">
          {mode === 'catalog' ? (
            <>
              <div className="sb-search" style={{ marginBottom: 12 }}>
                <Icon name="search" size={14}/>
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="고객사명 또는 별칭 검색"
                  autoFocus
                />
              </div>
              <div className="cust-pick-list scroll">
                {matches.length === 0 && <div className="svc-empty">검색 결과가 없습니다.</div>}
                {matches.map(customer => {
                  const name = getCustomerName(customer);
                  return (
                    <button
                      key={customer.id}
                      className="cust-pick"
                      onClick={() => onAdd(customer)}
                      disabled={busy}
                    >
                      <span className="sb-ch-avatar" style={{ background: customer.color || '#667085' }}>
                        {customer.initial || name[0] || '?'}
                      </span>
                      <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
                        <div className="text-3" style={{ fontSize: 11 }}>
                          {Array.isArray(customer.aliases) && customer.aliases.length > 0
                            ? customer.aliases.slice(0, 2).join(', ')
                            : customer.group || '고객사'}
                        </div>
                      </div>
                      <Icon name="plus" size={13} className="text-3"/>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <label className="form-label">
                <span>고객사명</span>
                <input
                  className="input"
                  value={newName}
                  onChange={event => setNewName(event.target.value)}
                  placeholder="신규 고객사명"
                  autoFocus
                />
              </label>
              <label className="form-label">
                <span>분류</span>
                <select className="input" value={newGroup} onChange={event => setNewGroup(event.target.value)}>
                  {(groupTags.length ? groupTags : ['IT']).map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>취소</button>
          {mode === 'new' && (
            <button className="btn primary" onClick={createNewCustomer} disabled={!newName.trim() || busy}>
              고객사 만들고 채널 추가
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
