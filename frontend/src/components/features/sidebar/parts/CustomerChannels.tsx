/**
 * @module components/features/sidebar/parts/CustomerChannels
 * @description 담당 고객사 채널 섹션. 필터 칩(전체/중요/미읽음/@멘션) + 인라인 검색창.
 *   검색어 없을 때: 등록된 채널 목록 표시.
 *   검색어 입력 시: 마스터 전체 고객사 검색 (채널 없는 고객사도 포함, 클릭 시 생성).
 * @usage <CustomerChannels customers={myCustomers} currentChannel={id} onChannel={fn} onAdd={fn} onRemove={fn}/>
 * @related ChannelPanel.jsx, AddCustomerModal.jsx
 */
import React from 'react';
import { Icon } from '../../../Icon.jsx';
import { SidebarSection } from './SidebarSection.jsx';
import { AddCustomerModal } from './AddCustomerModal.jsx';
import { useMasterData } from '../../../../contexts/MasterDataContext.js';
import { createChannel } from '../../../../features/messaging/api/messagingApi.js';
import { createCustomer } from '../../../../api/orgCustomerApi.js';

function filterRegistered(list, search, filter) {
  let result = [...list];
  const needle = search.trim().toLowerCase();
  if (needle) {
    result = result.filter(c =>
      String(c.name || c.customerName || '').toLowerCase().includes(needle) ||
      String(c.group || c.topic || '').toLowerCase().includes(needle),
    );
  }
  if (filter === 'starred')   result = result.filter(c => c.starred);
  if (filter === 'unread')    result = result.filter(c => c.unread > 0);
  if (filter === 'mentioned') result = result.filter(c => c.mentioned);
  return result;
}

export function CustomerChannels({ customers, search = '', currentChannel, onChannel, onAddCustomer, onRemoveCustomer }) {
  const [open, setOpen] = React.useState(true);
  const [showAddCustomer, setShowAddCustomer] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [filter, setFilter] = React.useState('all');
  const [localSearch, setLocalSearch] = React.useState('');

  const { customers: allMasterCustomers } = useMasterData();
  const list = customers || [];

  const effectiveQuery = localSearch || search;
  const isSearching = effectiveQuery.trim().length > 0;

  // 검색 모드: 마스터 전체 고객사 필터링
  const masterResults = React.useMemo(() => {
    if (!isSearching) return [];
    const needle = effectiveQuery.trim().toLowerCase();
    return (allMasterCustomers || []).filter(c => {
      const name = String(c.customerMain || c.name || '').toLowerCase();
      const aliases = (c.aliases || []).join(' ').toLowerCase();
      return name.includes(needle) || aliases.includes(needle);
    }).slice(0, 30);
  }, [effectiveQuery, isSearching, allMasterCustomers]);

  const totalUnread = list.reduce((n, c) => n + (c.unread || 0), 0);
  const hasMention = list.some(c => c.mentioned);
  const meta = hasMention ? '@' : (totalUnread > 0 ? totalUnread : null);

  // 채널 보유 여부 조회 (customerId 기준)
  const channelByCustomerId = React.useMemo(() => {
    const map = new Map<number, any>();
    list.forEach(c => {
      const cid = Number(c.customerId ?? c.id);
      if (Number.isFinite(cid)) map.set(cid, c);
    });
    return map;
  }, [list]);

  async function addCustomerChannel(customer) {
    if (adding) return;
    const customerName = customer.customerMain || customer.customerName || customer.name || '';
    if (!customerName.trim()) return;

    const existing = list.find(c => {
      const channelCustomerId = c.customerId ?? c.id;
      return Number(channelCustomerId) === Number(customer.id);
    });
    if (existing) {
      onChannel({ ...existing, kind: 'customer' });
      setShowAddCustomer(false);
      setLocalSearch('');
      return;
    }

    setAdding(true);
    try {
      let source = customer;
      let customerId = Number(customer.id);
      if (!Number.isFinite(customerId)) {
        source = await createCustomer({ customerMain: customerName.trim(), aliases: [] });
        customerId = Number(source.id);
      }

      const channel = await createChannel({
        kind: 'customer',
        name: customerName.trim(),
        topic: source.aliases?.length ? source.aliases.join(', ') : null,
        customerId,
      });
      onAddCustomer?.(channel);
      onChannel({ ...channel, kind: 'customer' });
      setShowAddCustomer(false);
      setLocalSearch('');
    } finally {
      setAdding(false);
    }
  }

  const filtered = isSearching ? [] : filterRegistered(list, '', filter);

  return (
    <>
      <SidebarSection
        label={`고객사${!isSearching && filtered.length !== list.length ? ` · ${filtered.length}` : ''}`}
        open={open}
        onToggle={() => setOpen(v => !v)}
        meta={meta}
        action={
          <button className="sb-add" title="고객사 채널 추가" onClick={() => setShowAddCustomer(true)}>
            <Icon name="plus" size={12}/>
          </button>
        }
      >
        {/* 칩 필터 — 검색어 없을 때만 표시 */}
        {!isSearching && (
          <div className="sb-mini-chips">
            {[['all','전체'],['starred','중요'],['unread','미읽음'],['mentioned','@멘션']].map(([v, label]) => (
              <button
                key={v}
                className={`sb-mini-chip${filter === v ? ' on' : ''}`}
                onClick={() => setFilter(v)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 인라인 검색창 */}
        <div className="sb-cust-search">
          <Icon name="search" size={12} className="sb-cust-search-icon"/>
          <input
            className="sb-cust-search-input"
            placeholder="고객사 검색..."
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
          />
          {localSearch && (
            <button className="sb-cust-search-clear" onClick={() => setLocalSearch('')}>
              <Icon name="x" size={10}/>
            </button>
          )}
        </div>

        {/* 검색 결과 — 마스터 전체 고객사 */}
        {isSearching ? (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {masterResults.length === 0 && (
              <div className="sb-empty">검색 결과가 없습니다.</div>
            )}
            {masterResults.map(c => {
              const existingChannel = channelByCustomerId.get(Number(c.id));
              const hasChannel = Boolean(existingChannel);
              return (
                <div key={c.id} className="sb-ch-row">
                  <button
                    className={`sb-ch${existingChannel && currentChannel === existingChannel.id ? ' on' : ''}${!hasChannel ? ' sb-ch-new' : ''}`}
                    onClick={() => addCustomerChannel(c)}
                    disabled={adding}
                  >
                    <span
                      className="sb-ch-avatar"
                      style={{
                        background: existingChannel?.color || '#667085',
                        opacity: hasChannel ? 1 : 0.45,
                      }}
                    >
                      {existingChannel?.initial || String(c.customerMain || c.name || '?')[0]}
                    </span>
                    <span className="sb-ch-name">{c.customerMain || c.name}</span>
                    <span className="sb-ch-action-tag">
                      {hasChannel
                        ? <Icon name="arrow-right" size={11} className="text-3"/>
                        : <Icon name="plus" size={11} className="text-3"/>
                      }
                    </span>
                  </button>
                </div>
              );
            })}
            {masterResults.length > 0 && (
              <div className="sb-search-count">검색 결과 {masterResults.length}건</div>
            )}
          </div>
        ) : (
          /* 일반 모드 — 등록된 채널 목록 */
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div className="sb-empty">등록된 고객사가 없습니다.</div>
            )}
            {filtered.map(c => (
              <div key={c.id} className="sb-ch-row">
                <button
                  className={`sb-ch${currentChannel === c.id ? ' on' : ''}${c.unread > 0 ? ' unread' : ''}`}
                  onClick={() => onChannel({ ...c, kind: 'customer' })}
                >
                  <span className="sb-ch-avatar" style={{ background: c.color || '#667085' }}>{c.initial || c.customerName?.[0] || c.name?.[0]}</span>
                  <span className="sb-ch-name">{c.customerName || c.name}</span>
                  {c.status === 'incident' && <span className="sb-pulse"/>}
                  {c.status === 'warning' && <span className="dot warn" style={{ flexShrink: 0 }}/>}
                  {c.starred && <Icon name="star-fill" size={10} className="sb-ch-star"/>}
                  {c.mentioned && <span className="sb-ch-mention">@</span>}
                  {c.unread > 0 && !c.mentioned && (
                    <span className="sb-badge sm">{c.unread}</span>
                  )}
                </button>
                {onRemoveCustomer && (
                  <button
                    className="sb-row-del"
                    title="목록에서 제거"
                    onClick={() => onRemoveCustomer(c.id)}
                  >
                    <Icon name="x" size={10}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SidebarSection>

      {showAddCustomer && (
        <AddCustomerModal
          existing={list.map(c => c.customerId ?? c.id)}
          onClose={() => setShowAddCustomer(false)}
          onAdd={addCustomerChannel}
          busy={adding}
        />
      )}
    </>
  );
}
