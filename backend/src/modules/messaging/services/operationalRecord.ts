import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import { findMessageById } from '../repository/messageRepository.js';
import { findChannelById } from '../repository/channelRepository.js';
import { createHistory } from '../../support-history/repository/supportHistoryRepository.js';
import { parseOperationalRecordText } from '../../support-history/services/textParser.js';
import { logAudit } from '../../audit/repository/auditRepository.js';

export async function parseOperationalRecordFromMessage(
  channelId: string | number,
  messageId: string | number,
) {
  return withOracleConnection(async (conn) => {
    const msg = await findMessageById(conn, messageId);
    if (!msg) throw Object.assign(new Error('Message not found'), { status: 404 });
    const channel = await findChannelById(conn, channelId);
    const parsed = await parseOperationalRecordText(String(msg.content || ''), channel?.name, {
      customerId: channel?.customerId ?? null,
    });
    return {
      ...parsed,
      historyDraft: {
        ...parsed.historyDraft,
        customerId: channel?.customerId ?? null,
      },
      source: {
        channelId,
        messageId,
      },
    };
  });
}

export async function confirmOperationalRecordFromMessage(
  channelId: string | number,
  messageId: string | number,
  parsed: any,
  userId: number,
): Promise<{ historyId: string }> {
  return withOracleTransaction(async (conn) => {
    const channel = await findChannelById(conn, channelId);
    const draft = parsed?.historyDraft || parsed || {};
    const created = await createHistory(conn, {
      customerId: draft.customerId ?? channel?.customerId,
      serviceName: draft.service || parsed?.service || 'Operational record',
      historyType: draft.historyType || parsed?.historyType || 'routine',
      supportMode: draft.supportMode || parsed?.supportMode || 'remote',
      priority: draft.priority || parsed?.priority || 'p3',
      summary: draft.summary || parsed?.summary || 'Operational record',
      workDetail: draft.workDetail || parsed?.rawText || '',
      finding: draft.finding || parsed?.finding || null,
      action: draft.action || parsed?.action || null,
      documentKind: parsed?.documentKind || null,
      aiConfidence: parsed?.confidence ?? null,
      parsedJson: parsed,
      metricCandidates: parsed?.metricCandidates || [],
      status: 'draft',
      createdBy: userId,
    });

    const historyId = created?.id ?? created?.historyId ?? '';
    await logAudit(conn, {
      userId,
      action: 'operational-record.extracted-from-message',
      entityType: 'support-history',
      entityId: String(historyId),
      summary: `Message ${messageId} operational record registered`,
      detail: { channelId, messageId },
    });
    return { historyId };
  });
}
