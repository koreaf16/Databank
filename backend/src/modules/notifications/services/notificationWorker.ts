// @ts-nocheck
/**
 * 파일: backend/src/modules/notifications/services/notificationWorker.ts
 * 역할: 일정 리마인더를 폴링해 앱 내부 알림을 생성한다.
 */

import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  fetchEventReminderRecipients,
  listEvents,
} from '../../calendar/repository/eventsRepository.js';
import { createNotification } from '../repository/notificationRepository.js';
import { publishNotification } from './notificationHub.js';

let workerTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

export function startNotificationWorker(): void {
  if (workerTimer) return;

  function tick() {
    processDueReminders()
      .catch((err: any) => console.warn(`[notification-worker] ${err?.message || err}`))
      .finally(() => { workerTimer = setTimeout(tick, 30000); });
  }

  console.log('[notification-worker] 일정 리마인더 워커 시작');
  tick();
}

export function stopNotificationWorker(): void {
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
}

async function processDueReminders(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await withOracleTransaction(async (conn) => {
      const now = new Date();
      const from = formatDateOnly(addDays(now, -1));
      const to = formatDateOnly(addDays(now, 1));
      const events = await listEvents(conn, { from, to });

      for (const event of events) {
        const reminderMinutes = Number(event.reminderMinutes);
        if (!Number.isFinite(reminderMinutes) || reminderMinutes < 0) continue;

        const start = parseLocalDateTime(event.startAt);
        const dueAt = new Date(start.getTime() - reminderMinutes * 60000);
        const ageMs = now.getTime() - dueAt.getTime();
        if (ageMs < 0 || ageMs > 5 * 60000) continue;

        const baseId = Number(event.baseId || event.id);
        if (!Number.isFinite(baseId)) continue;
        const recipients = await fetchEventReminderRecipients(conn, baseId, event.createdBy);
        const occurrenceKey = event.recurrenceOriginalStart || event.startAt;

        for (const userId of recipients) {
          const notification = await createNotification(conn, {
            userId,
            category: 'calendar',
            title: `일정 알림: ${event.title}`,
            message: `${formatKoreanTime(start)} 시작 예정`,
            entityType: 'event',
            entityId: String(event.id),
            dedupeKey: `calendar:${baseId}:${occurrenceKey}:${reminderMinutes}:${userId}`,
          });
          if (notification) publishNotification(userId, notification);
        }
      }
    });
  } finally {
    running = false;
  }
}

function parseLocalDateTime(value: string) {
  const [date, time] = String(value).slice(0, 16).split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function formatDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatKoreanTime(date: Date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

