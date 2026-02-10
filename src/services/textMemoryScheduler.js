import mongoose from 'mongoose';
import { DanConversation } from '../models/DanConversation.js';
import { DanMessage } from '../models/DanMessage.js';

import {
  saveSessionTranscript,
  createSessionSummary,
  updateUserProfileFromTranscript,
  createMemoryItemsFromSummary,
  refreshLongTermBriefIfNeeded,
} from './memoryService.js';

function safeObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

function buildTranscriptFromMessages(messages) {
  return messages
    .map((m) => {
      const role = m.role === 'assistant' ? 'DAN' : 'Usuario';
      return `${role}: ${String(m.text || '').trim()}`;
    })
    .filter(Boolean)
    .join('\n');
}

function getFlushLogConfig() {
  const enabled = String(process.env.DAN_TEXT_FLUSH_LOG || 'true').toLowerCase() === 'true';
  const maxChars = parseInt(process.env.DAN_TEXT_FLUSH_LOG_MAX_CHARS || '2500', 10);
  const transcriptChars = parseInt(process.env.DAN_TEXT_FLUSH_LOG_TRANSCRIPT_CHARS || '1200', 10);
  return { enabled, maxChars, transcriptChars };
}

function formatSummaryForLog(summaryDoc) {
  if (!summaryDoc) return '(no summaryDoc)';
  const contexto = summaryDoc.contexto || '';
  const tema = summaryDoc.tema_principal || '';
  const problema = summaryDoc.problema_clave || '';
  const hipotesis = summaryDoc.hipotesis || '';
  const plan = Array.isArray(summaryDoc.plan_accion) ? summaryDoc.plan_accion : [];
  const tareas = Array.isArray(summaryDoc.acuerdos_tareas) ? summaryDoc.acuerdos_tareas : [];
  const prox = Array.isArray(summaryDoc.seguimiento_proximo) ? summaryDoc.seguimiento_proximo : [];
  const tags = Array.isArray(summaryDoc.tags) ? summaryDoc.tags : [];
  const conf =
    typeof summaryDoc.confidence === 'number' ? summaryDoc.confidence : undefined;

  const lines = [];
  if (contexto) lines.push(`Contexto: ${contexto}`);
  if (tema) lines.push(`Tema: ${tema}`);
  if (problema) lines.push(`Problema: ${problema}`);
  if (hipotesis) lines.push(`Hipótesis: ${hipotesis}`);
  if (plan.length) lines.push(`Plan: ${plan.join(' | ')}`);
  if (tareas.length) lines.push(`Tareas: ${tareas.join(' | ')}`);
  if (prox.length) lines.push(`Seguimiento: ${prox.join(' | ')}`);
  if (tags.length) lines.push(`Tags: ${tags.join(', ')}`);
  if (conf !== undefined) lines.push(`Confidence: ${conf}`);

  return lines.join('\n');
}

/**
 * ✅ CLAVE: en texto, flushear “lo nuevo desde el último flush”, no “los últimos N mensajes”.
 * - Usa DanConversation.lastFlushedAt como watermark.
 * - Si nunca flusheó, usa desde inicio.
 */
export async function flushConversationMemory({
  userId,
  conversationId,
  reason = 'idle_flush',
  batchUserTurns = 6, // mantiene compat con tus settings
  minUserTurns = 2,
}) {
  const convoId = safeObjectId(conversationId);
  if (!convoId) return { ran: false, error: 'conversationId inválido' };

  const { enabled: LOG_ENABLED, maxChars: LOG_MAX, transcriptChars: LOG_TRX } =
    getFlushLogConfig();

  const convo = await DanConversation.findById(convoId).select('lastFlushedAt').lean();
  const watermark = convo?.lastFlushedAt ? new Date(convo.lastFlushedAt) : new Date(0);

  // “userTurns” global (para reglas minUserTurns)
  const totalUserTurns = await DanMessage.countDocuments({
    conversationId: convoId,
    role: 'user',
  });

  if (totalUserTurns < minUserTurns) {
    if (LOG_ENABLED) {
      console.log('[DAN][FLUSH][SKIP] not enough user turns', {
        conversationId: String(convoId),
        reason,
        totalUserTurns,
        minUserTurns,
      });
    }
    return { ran: false, reason: 'not_enough_user_turns', userTurns: totalUserTurns };
  }

  // Mensajes NUEVOS desde watermark
  const maxMessages = parseInt(process.env.DAN_TEXT_FLUSH_MAX_MESSAGES || '200', 10);
  const newMsgs = await DanMessage.find({
    conversationId: convoId,
    createdAt: { $gt: watermark },
  })
    .sort({ createdAt: 1 })
    .limit(maxMessages)
    .select('role text createdAt')
    .lean();

  // Si no hay nada nuevo, no hagas nada (evita “flush vacío” cada minuto)
  if (!newMsgs.length) {
    if (LOG_ENABLED) {
      console.log('[DAN][FLUSH][SKIP] no new messages since lastFlushedAt', {
        conversationId: String(convoId),
        reason,
        lastFlushedAt: watermark.toISOString(),
      });
    }
    return { ran: false, reason: 'no_new_messages', userTurns: totalUserTurns };
  }

  // transcript de lo nuevo
  const transcript = buildTranscriptFromMessages(newMsgs);

  // sessionId único (evita colisiones por userTurns)
  const sessionId = `text:${String(convoId)}:${Date.now()}:${reason}`;
  const metadata = {
    channel: 'text',
    conversationId: String(convoId),
    reason,
    watermark: watermark.toISOString(),
    newMessages: newMsgs.length,
    // dejo estos por compat/debug
    totalUserTurns,
    batchUserTurns: Math.max(parseInt(batchUserTurns, 10) || 6, 2),
  };

  await saveSessionTranscript({ userId, sessionId, transcript, metadata });
  const summaryDoc = await createSessionSummary({ userId, sessionId, transcript });
  const profileResult = await updateUserProfileFromTranscript({ userId, transcript });
  const memoryResult = await createMemoryItemsFromSummary({ userId, sessionId, summary: summaryDoc });
  const longTermResult = await refreshLongTermBriefIfNeeded({ userId, force: false });

  if (LOG_ENABLED) {
    const trxSnippet = transcript.slice(0, LOG_TRX);
    const summaryText = formatSummaryForLog(summaryDoc).slice(0, LOG_MAX);

    console.log('================ [DAN][FLUSH] ================');
    console.log('[DAN][FLUSH] meta:', {
      conversationId: String(convoId),
      sessionId,
      reason,
      lastFlushedAt: watermark.toISOString(),
      newMessages: newMsgs.length,
      totalUserTurns,
      summaryId: String(summaryDoc?._id || ''),
      userProfileUpdated: Boolean(profileResult?.updated),
      memoryItemsCreated: memoryResult?.created ?? 0,
      longTermBriefUpdated: Boolean(longTermResult?.updated),
    });
    console.log('[DAN][FLUSH] transcript_snippet:\n', trxSnippet);
    console.log('[DAN][FLUSH] summary:\n', summaryText);
    console.log('============== [DAN][FLUSH END] ==============');
  }

  // ✅ watermark avanza: lastFlushedAt = now
  await DanConversation.findByIdAndUpdate(
    convoId,
    {
      $set: {
        pendingMemoryFlush: false,
        lastFlushedAt: new Date(),
        lastFlushReason: reason,
        lastFlushUserTurns: totalUserTurns,
      },
    },
    { new: false }
  );

  return {
    ran: true,
    sessionId,
    summaryId: summaryDoc?._id,
    user_profile_updated: profileResult.updated,
    memory_items_created: memoryResult.created,
    long_term_brief_updated: longTermResult.updated,
    userTurns: totalUserTurns,
    reason,
    newMessages: newMsgs.length,
  };
}

/**
 * Debounce en memoria: cada nuevo mensaje reprograma el flush.
 */
const timers = new Map();
const locks = new Set();

export function scheduleTextMemoryFlush({
  userId,
  conversationId,
  idleMs = 90_000,
  batchUserTurns = 6,
  minUserTurns = 2,
}) {
  const key = String(conversationId);

  if (timers.has(key)) {
    clearTimeout(timers.get(key));
    timers.delete(key);
  }

  const timeoutId = setTimeout(async () => {
    timers.delete(key);

    if (locks.has(key)) return;
    locks.add(key);

    try {
      const result = await flushConversationMemory({
        userId,
        conversationId,
        reason: 'idle_flush',
        batchUserTurns,
        minUserTurns,
      });

      const { enabled: LOG_ENABLED } = getFlushLogConfig();
      if (LOG_ENABLED) {
        console.log('[DAN][FLUSH][IDLE] done:', {
          conversationId: String(conversationId),
          ran: Boolean(result?.ran),
          reason: result?.reason || 'idle_flush',
          userTurns: result?.userTurns,
          sessionId: result?.sessionId,
          newMessages: result?.newMessages,
        });
      }
    } catch (e) {
      console.error('[textMemoryScheduler] idle flush error:', e);
    } finally {
      locks.delete(key);
    }
  }, idleMs);

  timers.set(key, timeoutId);
}

/**
 * Reconciler: procesa conversaciones pendientes y “viejas”.
 */
export async function runPendingTextFlushes({
  idleMs = 90_000,
  batchUserTurns = 6,
  minUserTurns = 2,
  limit = 25,
} = {}) {
  const cutoff = new Date(Date.now() - idleMs);

  const pending = await DanConversation.find({
    pendingMemoryFlush: true,
    lastMessageAt: { $lte: cutoff },
  })
    .sort({ lastMessageAt: 1 })
    .limit(limit)
    .select('_id userId lastMessageAt')
    .lean();

  let ran = 0;

  for (const convo of pending) {
    try {
      const result = await flushConversationMemory({
        userId: convo.userId,
        conversationId: convo._id,
        reason: 'reconciler',
        batchUserTurns,
        minUserTurns,
      });
      if (result?.ran) ran += 1;
    } catch (e) {
      console.error('[textMemoryScheduler] reconciler flush error:', e);
    }
  }

  const { enabled: LOG_ENABLED } = getFlushLogConfig();
  if (LOG_ENABLED) {
    console.log('[DAN][FLUSH][RECONCILER] summary:', {
      cutoff: cutoff.toISOString(),
      scanned: pending.length,
      ran,
    });
  }

  return { scanned: pending.length, ran };
}
