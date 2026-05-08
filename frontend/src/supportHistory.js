const WORKDAY_START_HOUR = 9;
const WORKDAY_END_HOUR = 18;
const WORKDAY_MINUTES = (WORKDAY_END_HOUR - WORKDAY_START_HOUR) * 60;

const HOLIDAYS_BY_YEAR = {
  2026: [
    '2026-01-01',
    '2026-02-16',
    '2026-02-17',
    '2026-02-18',
    '2026-03-02',
    '2026-05-05',
    '2026-05-24',
    '2026-05-25',
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
    '2026-10-09',
    '2026-12-25',
  ],
};

export {
  HOLIDAYS_BY_YEAR,
  WORKDAY_END_HOUR,
  WORKDAY_MINUTES,
  WORKDAY_START_HOUR,
};

export function normalizeSupportHistoryList(list = []) {
  return list
    .map(normalizeSupportHistoryRecord)
    .sort((a, b) => getHistoryBaseTime(b) - getHistoryBaseTime(a));
}

export function normalizeSupportHistoryRecord(record = {}) {
  const supportMode = record.supportMode || (record.method === '방문' ? 'onsite' : 'remote');
  const method = record.method || (supportMode === 'onsite' ? '방문' : '원격');
  const participants = Array.isArray(record.participants) && record.participants.length > 0
    ? dedupeParticipants(record.participants)
    : record.manager
      ? [record.manager]
      : [];
  const timeline = normalizeTimeline(record, supportMode);
  const baseAt = getBaseAtFromTimeline(timeline, supportMode);
  const range = getActualSupportRange({ supportMode, timeline });
  const actualMinutes = range ? Math.max(0, Math.round((range.end - range.start) / 60000)) : 0;
  const dateLabel = formatDateTimeCompact(baseAt);
  const displayRange = range ? `${formatTime(range.start)} ~ ${formatTime(range.end)}` : '-';

  return {
    ...record,
    method,
    supportMode,
    participants,
    manager: record.manager || participants[0] || null,
    timeline,
    baseAt: toIsoMinute(baseAt),
    actualMinutes,
    displayRange,
    date: record.date || dateLabel,
  };
}

export function createSupportHistoryRecord(input = {}) {
  const supportMode = input.supportMode === 'onsite' ? 'onsite' : 'remote';
  const method = supportMode === 'onsite' ? '방문' : '원격';
  const participants = dedupeParticipants(input.participants || []);
  const manager = input.manager || participants[0] || null;
  const historyId = input.id || `H-${String(Date.now()).slice(-6)}`;

  return normalizeSupportHistoryRecord({
    id: historyId,
    customer: input.customer,
    service: input.service,
    type: input.type || 'tech',
    summary: input.summary || '지원 이력이 등록되었습니다.',
    workDetail: input.workDetail || input.summary || '지원 요청 내용을 기준으로 작업을 수행했습니다.',
    finding: input.finding || '현장 확인 및 로그 검토 결과를 기록했습니다.',
    action: input.action || '조치 결과와 후속 확인 항목을 정리했습니다.',
    supportMode,
    method,
    manager,
    participants,
    timeline: input.timeline || {},
  });
}

export function getHistoryBaseTime(record) {
  const normalized = record?.timeline ? record : normalizeSupportHistoryRecord(record);
  const date = fromValue(normalized.baseAt) || getBaseAtFromTimeline(normalized.timeline, normalized.supportMode);
  return date || new Date(0);
}

export function getHistoryParticipants(record) {
  return dedupeParticipants(record?.participants || (record?.manager ? [record.manager] : []));
}

export function getActualSupportRange(record) {
  const timeline = record?.timeline || {};
  if ((record?.supportMode || 'remote') === 'onsite') {
    const start = fromValue(timeline.departureAt);
    const end = fromValue(timeline.returnAt);
    if (!start || !end || end <= start) return null;
    return { start, end };
  }

  const start = fromValue(timeline.supportStartedAt);
  const end = fromValue(timeline.supportEndedAt);
  if (!start || !end || end <= start) return null;
  return { start, end };
}

export function getHistoryTimelineRows(record) {
  const timeline = record?.timeline || {};
  if ((record?.supportMode || 'remote') === 'onsite') {
    return [
      { label: '출발시간', value: timeline.departureAt },
      { label: '지원시작시간', value: timeline.supportStartedAt },
      { label: '지원종료시간', value: timeline.supportEndedAt },
      { label: '복귀시간', value: timeline.returnAt },
    ];
  }

  return [
    { label: '지원시작시간', value: timeline.supportStartedAt },
    { label: '지원종료시간', value: timeline.supportEndedAt },
  ];
}

export function formatDateTimeCompact(value) {
  const date = fromValue(value);
  if (!date) return '-';
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateTimeFull(value) {
  const date = fromValue(value);
  if (!date) return '-';
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatTime(value) {
  const date = fromValue(value);
  if (!date) return '-';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDuration(minutes = 0) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours > 0 && mins > 0) return `${hours}시간 ${mins}분`;
  if (hours > 0) return `${hours}시간`;
  return `${mins}분`;
}

export function formatUtilizationPercent(actualMinutes, possibleMinutes) {
  if (!possibleMinutes) return '0%';
  return `${Math.round((actualMinutes / possibleMinutes) * 100)}%`;
}

export function getMonthKey(value) {
  const date = fromValue(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function listMonthKeysFromHistories(histories = []) {
  const keys = new Set();
  histories.forEach(history => {
    const range = getActualSupportRange(history);
    if (!range) return;
    let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    const limit = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
    while (cursor <= limit) {
      keys.add(getMonthKey(cursor));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  });
  return Array.from(keys).sort().reverse();
}

export function getPossibleWorkMinutes(monthKey, holidaysByYear = HOLIDAYS_BY_YEAR) {
  const [yearText, monthText] = String(monthKey || '').split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return 0;

  const holidays = new Set(holidaysByYear[year] || []);
  const dayCount = new Date(year, month, 0).getDate();
  let workdays = 0;

  for (let day = 1; day <= dayCount; day += 1) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    const iso = localDateKey(date);
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    if (holidays.has(iso)) continue;
    workdays += 1;
  }

  return workdays * WORKDAY_MINUTES;
}

export function buildEngineerUtilization(histories = [], engineers = [], monthKey, filterMode = 'all') {
  const monthStart = monthKeyToDate(monthKey);
  if (!monthStart) {
    return engineers.map(engineer => ({
      ...engineer,
      possibleMinutes: 0,
      onsiteMinutes: 0,
      remoteMinutes: 0,
      totalMinutes: 0,
      supportCount: 0,
      utilizationPct: 0,
    }));
  }
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const possibleMinutes = getPossibleWorkMinutes(monthKey);
  const rows = engineers.map(engineer => ({
    ...engineer,
    possibleMinutes,
    onsiteMinutes: 0,
    remoteMinutes: 0,
    totalMinutes: 0,
    supportCount: 0,
  }));
  const rowMap = new Map(rows.map(row => [row.id, row]));

  histories.forEach(history => {
    if (filterMode !== 'all' && history.supportMode !== filterMode) return;
    const range = getActualSupportRange(history);
    if (!range) return;
    const actualMinutes = overlapMinutes(range.start, range.end, monthStart, monthEnd);
    if (actualMinutes <= 0) return;

    const assigned = new Set();
    getHistoryParticipants(history).forEach(engineer => {
      if (!engineer?.id || assigned.has(engineer.id)) return;
      assigned.add(engineer.id);
      const row = rowMap.get(engineer.id);
      if (!row) return;
      row.totalMinutes += actualMinutes;
      if (history.supportMode === 'onsite') row.onsiteMinutes += actualMinutes;
      else row.remoteMinutes += actualMinutes;
      row.supportCount += 1;
    });
  });

  return rows
    .map(row => ({
      ...row,
      utilizationPct: row.possibleMinutes > 0 ? (row.totalMinutes / row.possibleMinutes) * 100 : 0,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes || a.name.localeCompare(b.name, 'ko'));
}

export function buildUtilizationSummary(histories = [], engineers = [], monthKey, filterMode = 'all') {
  const rows = buildEngineerUtilization(histories, engineers, monthKey, filterMode);
  const monthStart = monthKeyToDate(monthKey);
  if (!monthStart) {
    return {
      rows,
      possibleMinutes: 0,
      onsiteMinutes: 0,
      remoteMinutes: 0,
      totalMinutes: 0,
      supportCount: 0,
      utilizationPct: 0,
    };
  }
  const possibleMinutes = rows.reduce((sum, row) => sum + row.possibleMinutes, 0);
  const onsiteMinutes = rows.reduce((sum, row) => sum + row.onsiteMinutes, 0);
  const remoteMinutes = rows.reduce((sum, row) => sum + row.remoteMinutes, 0);
  const totalMinutes = onsiteMinutes + remoteMinutes;
  const supportCount = histories.filter(history => {
    if (filterMode !== 'all' && history.supportMode !== filterMode) return false;
    const range = getActualSupportRange(history);
    if (!range) return false;
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    return overlapMinutes(range.start, range.end, monthStart, monthEnd) > 0;
  }).length;

  return {
    rows,
    possibleMinutes,
    onsiteMinutes,
    remoteMinutes,
    totalMinutes,
    supportCount,
    utilizationPct: possibleMinutes > 0 ? (totalMinutes / possibleMinutes) * 100 : 0,
  };
}

export function monthLabel(monthKey) {
  const [yearText, monthText] = String(monthKey || '').split('-');
  return yearText && monthText ? `${yearText}.${monthText}` : '-';
}

function dedupeParticipants(participants = []) {
  const seen = new Set();
  return participants.filter(participant => {
    if (!participant?.id || seen.has(participant.id)) return false;
    seen.add(participant.id);
    return true;
  });
}

function normalizeTimeline(record, supportMode) {
  const timeline = { ...(record.timeline || {}) };
  if (supportMode === 'onsite') {
    const base = fromValue(timeline.departureAt || timeline.supportStartedAt || record.baseAt || record.date);
    const supportStart = fromValue(timeline.supportStartedAt) || shiftMinutes(base, 40);
    const supportEnd = fromValue(timeline.supportEndedAt) || shiftMinutes(supportStart, 360);
    const departure = fromValue(timeline.departureAt) || shiftMinutes(supportStart, -40);
    const returning = fromValue(timeline.returnAt) || shiftMinutes(supportEnd, 55);
    return {
      departureAt: toIsoMinute(departure),
      supportStartedAt: toIsoMinute(supportStart),
      supportEndedAt: toIsoMinute(supportEnd),
      returnAt: toIsoMinute(returning),
    };
  }

  const base = fromValue(timeline.supportStartedAt || record.baseAt || record.date);
  const supportStart = fromValue(timeline.supportStartedAt) || shiftMinutes(base, -90);
  const supportEnd = fromValue(timeline.supportEndedAt) || shiftMinutes(supportStart, 90);
  return {
    supportStartedAt: toIsoMinute(supportStart),
    supportEndedAt: toIsoMinute(supportEnd),
  };
}

function getBaseAtFromTimeline(timeline = {}, supportMode) {
  return supportMode === 'onsite'
    ? fromValue(timeline.departureAt || timeline.supportStartedAt)
    : fromValue(timeline.supportStartedAt);
}

function monthKeyToDate(monthKey) {
  const [yearText, monthText] = String(monthKey || '').split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return null;
  const date = new Date(year, month - 1, 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

function overlapMinutes(start, end, rangeStart, rangeEnd) {
  const from = Math.max(start.getTime(), rangeStart.getTime());
  const to = Math.min(end.getTime(), rangeEnd.getTime());
  return Math.max(0, Math.round((to - from) / 60000));
}

function shiftMinutes(value, minutes) {
  const date = fromValue(value);
  if (!date) return null;
  return new Date(date.getTime() + minutes * 60000);
}

function localDateKey(value) {
  const date = fromValue(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toIsoMinute(value) {
  const date = fromValue(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad(value) {
  return String(value).padStart(2, '0');
}
