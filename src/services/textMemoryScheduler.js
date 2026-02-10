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

/**
 * Ejecuta el pipeline “texto” usando últimos N turnos (N user turns, y hasta N*2 mensajes).
 * Deja pendingMemoryFlush=false si completó.
 */
export async function flushConversationMemory({
  userId,
  conversationId,
  reason = 'idle_flush',
  batchUserTurns = 6,
  minUserTurns = 2,
}) {
  const convoId = safeObjectId(conversationId);
  if (!convoId) return { ran: false, error: 'conversationId inválido' };

  // Evita flush sin contenido real
  const userTurns = await DanMessage.countDocuments({
    conversationId: convoId,
    role: 'user',
  });

  if (userTurns < minUserTurns) {
    // No lo marcamos como flushed; pero sí podés limpiar pending si querés.
    return { ran: false, reason: 'not_enough_user_turns', userTurns };
  }

  const N = Math.max(parseInt(batchUserTurns, 10) || 6, 2);

  const lastMsgs = await DanMessage.find({ conversationId: convoId })
    .sort({ createdAt: -1 })
    .limit(N * 2)
    .select('role text createdAt')
    .lean();

  const ordered = lastMsgs.reverse();
  const transcript = buildTranscriptFromMessages(ordered);

  const sessionId = `text:${String(convoId)}:${userTurns}:${reason}`;
  const metadata = {
    channel: 'text',
    conversationId: String(convoId),
    userTurns,
    batchSize: N,
    reason,
  };

  await saveSessionTranscript({ userId, sessionId, transcript, metadata });
  const summaryDoc = await createSessionSummary({ userId, sessionId, transcript });
  const profileResult = await updateUserProfileFromTranscript({ userId, transcript });
  const memoryResult = await createMemoryItemsFromSummary({ userId, sessionId, summary: summaryDoc });
  const longTermResult = await refreshLongTermBriefIfNeeded({ userId, force: false });

  await DanConversation.findByIdAndUpdate(
    convoId,
    {
      $set: {
        pendingMemoryFlush: false,
        lastFlushedAt: new Date(),
        lastFlushReason: reason,
        lastFlushUserTurns: userTurns,
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
    userTurns,
    reason,
  };
}

/**
 * Debounce en memoria: cada nuevo mensaje reprograma el flush.
 * Si el usuario cierra la app, igual corre (si el server sigue vivo).
 */
const timers = new Map(); // key = conversationId (string), value = timeoutId
const locks = new Set();  // evita flush simultáneo

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
      await flushConversationMemory({
        userId,
        conversationId,
        reason: 'idle_flush',
        batchUserTurns,
        minUserTurns,
      });
    } catch (e) {
      console.error('[textMemoryScheduler] idle flush error:', e);
    } finally {
      locks.delete(key);
    }
  }, idleMs);

  timers.set(key, timeoutId);
}

/**
 * Reconciler: corre en boot (y opcionalmente cada X tiempo) para no perder flush
 * si el server se reinició antes del setTimeout.
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

  return { scanned: pending.length, ran };
}
