import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { Message } from './Message.js';
import { ForwardMessageModal } from './ForwardMessageModal.js';
import { CustomerMentionCard } from './CustomerMentionCard.js';
import { MessageTargetsBar } from './MessageTargetsBar.js';
import { MessageContextTag } from './MessageContextTag.js';
import { getMessages, sendMessage } from '../api/messagingApi.js';
import { useUser } from '../../../contexts/UserContext.js';
import { useMasterData } from '../../../contexts/MasterDataContext.js';

export function Conversation({
  channel,
  isDM,
  services = [],
  servers = [],
  activeServiceId = 'all',
  myTeamId,
  showOtherTeams = false,
  onOpenThread,
  onGoChannel,
  onClearServiceFilter,
  // 업무·서버 N:M
  workspaces = [],
  selectedWorkspaceId = 'all',
  selectedServerIds = [],
  onToggleServerTarget,
  onClearServerTargets,
  activeWorkspaceName = null,
}: any) {
  const [text, setText] = React.useState('');
  const [forwardMsg, setForwardMsg] = React.useState<any>(null);
  const [mentionSuggestions, setMentionSuggestions] = React.useState<any[]>([]);
  const [serverSuggestions, setServerSuggestions] = React.useState<any[]>([]);
  const [mentionCards, setMentionCards] = React.useState<any[]>([]);
  const [msgDays, setMsgDays] = React.useState<any[]>([]);
  const [sending, setSending] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const me = useUser();
  const { customers, departments } = useMasterData();

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeServiceId, showOtherTeams, msgDays]);

  const fetchParams = React.useMemo(() => {
    const p: any = {};
    if (selectedWorkspaceId !== 'all' && selectedWorkspaceId != null) {
      p.workspaceId = selectedWorkspaceId;
    }
    if (Array.isArray(selectedServerIds) && selectedServerIds.length > 0) {
      p.serverIds = selectedServerIds;
    }
    return p;
  }, [selectedWorkspaceId, JSON.stringify(selectedServerIds)]);

  React.useEffect(() => {
    if (!channel?.id) {
      setMsgDays([]);
      return;
    }
    getMessages(channel.id, fetchParams)
      .then(days => setMsgDays(normalizeMessageDays(days)))
      .catch(() => setMsgDays([]));
  }, [channel?.id, fetchParams]);

  async function handleSend() {
    const content = text.trim();
    if (!content || sending || !channel?.id) return;
    // DM이 아닐 때는 업무가 선택돼야 메시지 전송 가능 (업무 컨텍스트 필수)
    if (!isDM && (selectedWorkspaceId === 'all' || selectedWorkspaceId == null)) return;
    setSending(true);
    setText('');
    setMentionCards([]);
    try {
      await sendMessage(channel.id, {
        content,
        authorUserId: me?.id,
        workspaceId: selectedWorkspaceId === 'all' ? null : selectedWorkspaceId,
        serverIds: selectedServerIds,
      });
      const refreshed = await getMessages(channel.id, fetchParams);
      setMsgDays(normalizeMessageDays(refreshed));
    } catch {
      setText(content);
    } finally {
      setSending(false);
    }
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);

    // @업무명 자동완성
    const atMatch = val.match(/@([\w가-힣\-\.]*)$/);
    if (atMatch) {
      const q = atMatch[1].toLowerCase();
      setServerSuggestions(
        servers
          .filter((s: any) => String(s.serverName || '').toLowerCase().includes(q))
          .slice(0, 6),
      );
      setMentionSuggestions([]);
      return;
    }
    setServerSuggestions([]);

    // #고객사명 자동완성
    const hashMatch = val.match(/#([\w가-힣]*)$/);
    if (!hashMatch) {
      setMentionSuggestions([]);
      return;
    }
    const q = hashMatch[1].toLowerCase();
    setMentionSuggestions(
      customers
        .filter((customer: any) => String(customer.name || '').toLowerCase().includes(q))
        .slice(0, 6),
    );
  }

  function insertServerMention(server: any) {
    const name = server.serverName || '';
    setText(text.replace(/@[\w가-힣\-\.]*$/, `@${name} `));
    setServerSuggestions([]);
  }

  function insertMention(customer: any) {
    const name = customer.name || customer.customerMain || '';
    setText(text.replace(/#[\w가-힣]*$/, `#${name} `));
    setMentionSuggestions([]);
    setMentionCards(prev => prev.find(c => c.id === customer.id) ? prev : [...prev, customer]);
  }

  const teamMap = React.useMemo(
    () => Object.fromEntries(departments.map((dept: any) => [dept.id, dept])),
    [departments],
  );

  const serviceMap = React.useMemo(
    () => Object.fromEntries(services.map((service: any) => [service.id, service])),
    [services],
  );

  const activeServer = activeServiceId !== 'all'
    ? servers.find((s: any) => s.id === activeServiceId)
    : null;

  function passes(message: any) {
    if (isDM || message.type === 'system') return true;
    if (message.teamId && message.teamId !== myTeamId && !showOtherTeams) return false;
    // 업무·서버 필터는 백엔드(workspaceId / serverIds 쿼리)에서 처리됨
    return true;
  }

  // 메시지 옆 컨텍스트 태그 노출 여부:
  //   - [업무 전체] 모드 → variant="workspace" ([업무명/서버명])
  //   - [업무 X] + [서버 전체] → variant="server" ([서버명])
  //   - [업무 X] + [서버 Y] 단일 → 컨텍스트 명확하므로 태그 없음
  const ctxTagVariant: 'workspace' | 'server' | null =
    selectedWorkspaceId === 'all'
      ? 'workspace'
      : (selectedServerIds.length === 0 ? 'server' : null);

  function workspaceNameOf(msg: any): string | null {
    if (!msg?.workspaceId) return null;
    return workspaces.find((w: any) => Number(w.id) === Number(msg.workspaceId))?.name ?? null;
  }

  return (
    <div className="conv">
      <div className="conv-scroll scroll" ref={scrollRef}>
        {msgDays.map((day, dayIndex) => {
          const filtered = day.messages.filter(passes);
          if (filtered.length === 0) return null;
          return (
            <div key={day.date || dayIndex}>
              <div className="day-divider"><span>{day.date}</span></div>
              {filtered.map((message: any) => {
                if (message.type === 'system') {
                  return <div key={message.id} className="msg-system">{message.text}</div>;
                }
                const svc = message.serviceId ? serviceMap[message.serviceId] : null;
                const team = message.teamId ? teamMap[message.teamId] : null;
                const showCtxTag = !isDM && ctxTagVariant !== null;
                return (
                  <div key={message.id} className="msg-with-ctx">
                    {showCtxTag && (
                      <div className="msg-ctx-row">
                        <MessageContextTag
                          workspaceName={workspaceNameOf(message)}
                          targets={message.targets || []}
                          variant={ctxTagVariant!}
                        />
                      </div>
                    )}
                    <Message
                      m={message}
                      svc={svc}
                      team={team}
                      isOtherTeam={team && team.id !== myTeamId}
                      channelId={channel.id}
                      servers={servers}
                      onOpenThread={onOpenThread}
                      onForward={setForwardMsg}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {!isDM && selectedWorkspaceId !== 'all' && (
        <MessageTargetsBar
          servers={servers}
          selectedServerIds={selectedServerIds}
          onRemove={(sid) => onToggleServerTarget?.(sid)}
        />
      )}

      <div className="composer" style={{ position: 'relative' }}>
        {serverSuggestions.length > 0 && (
          <div
            className="mention-dropdown"
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 12,
              right: 12,
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 6px 20px rgba(0,0,0,.15)',
              zIndex: 50,
            }}
          >
            <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              업무(서버)
            </div>
            {serverSuggestions.map((server: any) => (
              <button
                key={server.id}
                className="btn ghost"
                style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 16px', gap: 8 }}
                onMouseDown={e => { e.preventDefault(); insertServerMention(server); }}
              >
                <span className="svc-mention" style={{ fontSize: 12 }}>@{server.serverName}</span>
                {server.productName && <span className="text-3" style={{ fontSize: 11 }}>{server.productName}</span>}
              </button>
            ))}
          </div>
        )}
        {mentionSuggestions.length > 0 && (
          <div
            className="mention-dropdown"
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 12,
              right: 12,
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 6px 20px rgba(0,0,0,.15)',
              zIndex: 50,
            }}
          >
            {mentionSuggestions.map(customer => (
              <button
                key={customer.id}
                className="btn ghost"
                style={{ width: '100%', justifyContent: 'flex-start', padding: '10px 16px' }}
                onMouseDown={event => {
                  event.preventDefault();
                  insertMention(customer);
                }}
              >
                <span className="avatar sm" style={{ background: customer.color, marginRight: 10 }}>
                  {customer.initial}
                </span>
                {customer.name}
              </button>
            ))}
          </div>
        )}

        {/* 상단 도구 바 */}
        <div className="composer-tools">
          <button className="composer-tool" title="굵게"><b>B</b></button>
          <button className="composer-tool" title="기울임"><i>I</i></button>
          <button className="composer-tool" title="밑줄"><span style={{ textDecoration: 'underline' }}>U</span></button>
          <span className="composer-divider"/>
          <button className="composer-tool" title="멤버 호출" onClick={() => setText(t => t + '@')}>@</button>
          <button className="composer-tool" title="업무 호출" onClick={() => setText(t => t + '@')}>
            <Icon name="hash" size={13} className="" style={undefined}/>
          </button>
          <button className="composer-tool" title="파일 첨부">
            <Icon name="paperclip" size={13} className="" style={undefined}/>
          </button>
          <button className="composer-tool" title="이모지">
            <Icon name="smile" size={13} className="" style={undefined}/>
          </button>
          <span className="composer-divider"/>
          <button className="composer-tool ai" title="AI 작성">
            <Icon name="sparkles" size={13} className="" style={undefined}/> AI 작성
          </button>
        </div>

        {/* 입력창 */}
        <textarea
          className="composer-input"
          placeholder={
            isDM
              ? `${channel.name}님에게 메시지`
              : selectedWorkspaceId === 'all'
                ? '업무를 먼저 선택해 주세요'
                : selectedServerIds.length > 0
                  ? `${selectedServerIds.length}개 서버 대상 메시지`
                  : `${activeWorkspaceName ?? '업무 전체'} 메시지 보내기`
          }
          value={text}
          onChange={handleTextChange}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          disabled={sending || (!isDM && selectedWorkspaceId === 'all')}
          style={{ width: '100%' }}
        />

        {/* 고객사 멘션 카드 */}
        {mentionCards.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            {mentionCards.map(customer => (
              <CustomerMentionCard key={customer.id} customer={customer} onGoChannel={onGoChannel}/>
            ))}
          </div>
        )}

        {/* 하단 바 */}
        <div className="composer-bottom">
          <div className="composer-tools">
            <button className="composer-tool sm">+ 이력 등록</button>
            <button className="composer-tool sm">+ 일정 추가</button>
            {!isDM && selectedWorkspaceId !== 'all' && activeWorkspaceName && (
              <span className="tag info xs" style={{ marginLeft: 4 }}>
                업무: {activeWorkspaceName}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn sm ghost" disabled={!text.trim()}>초안 저장</button>
            <button
              className="btn sm primary"
              onClick={handleSend}
              disabled={!text.trim() || sending || (!isDM && selectedWorkspaceId === 'all')}
              style={{ opacity: text.trim() && !sending && (isDM || selectedWorkspaceId !== 'all') ? 1 : 0.5 }}
            >
              <Icon name="send" size={12} className="" style={undefined}/>
              전송
              <span style={{
                marginLeft: 4, fontSize: 10, fontWeight: 700,
                background: 'rgba(255,255,255,.25)', borderRadius: 3,
                padding: '1px 4px', lineHeight: 1.4,
              }}>↵</span>
            </button>
          </div>
        </div>
      </div>

      {forwardMsg && (
        <ForwardMessageModal
          message={forwardMsg}
          onClose={(target?: any) => {
            setForwardMsg(null);
            if (target) onGoChannel?.(target);
          }}
        />
      )}
    </div>
  );
}

function normalizeMessageDays(days: any[] = []) {
  return (Array.isArray(days) ? days : []).map(day => ({
    ...day,
    messages: (day.messages || []).map(normalizeMessage),
  }));
}

function normalizeMessage(message: any) {
  const name = message.author?.name || message.authorName || message.botName || 'Unknown';
  return {
    ...message,
    type: message.type || message.msgType,
    text: message.text ?? message.content ?? '',
    thread: message.thread ?? message.threadCount ?? 0,
    time: message.time || formatMessageTime(message.sentAt),
    author: message.author || {
      name,
      initial: name[0] || '?',
      color: message.isBot ? '#667085' : '#356bf0',
    },
  };
}

function formatMessageTime(value: string | null) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
