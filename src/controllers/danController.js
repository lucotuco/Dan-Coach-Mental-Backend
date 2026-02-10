// src/controllers/danController.js
import mongoose from 'mongoose';
import { DanConversation } from '../models/DanConversation.js';
import { DanMessage } from '../models/DanMessage.js';
import { User } from '../models/User.js';
import { chatWithDan } from '../services/danCoach.js';
import { Chequeo } from '../models/Chequeo.js';

import { buildContextPack } from '../services/memoryService.js';
import {
  flushConversationMemory,
  scheduleTextMemoryFlush,
} from '../services/textMemoryScheduler.js';

function getAuthUserId(req) {
  return req.user?.userId || req.user?.id || req.user?._id || req.user?.sub || null;
}

function safeObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

/**
 * Pipeline automático por N turnos (tu lógica original), pero usando flushConversationMemory
 * y dejando la conversación “no pending” cuando corre.
 */
async function maybeRunTextMemoryPipeline({ userId, conversationId }) {
  const N = Math.max(parseInt(process.env.DAN_TEXT_SUMMARY_EVERY_N_TURNS || '6', 10), 2);

  const userTurns = await DanMessage.countDocuments({
    conversationId,
    role: 'user',
  });

  if (userTurns === 0 || userTurns % N !== 0) return { ran: false };

  return flushConversationMemory({
    userId,
    conversationId,
    reason: 'n_turns',
    batchUserTurns: N,
    minUserTurns: Math.max(parseInt(process.env.DAN_TEXT_IDLE_MIN_USER_TURNS || '2', 10), 1),
  });
}

async function logConversationPendingState(conversationId, label) {
  const enabled = String(process.env.DAN_TEXT_PENDING_DEBUG || 'true').toLowerCase() === 'true';
  if (!enabled) return;

  const dbg = await DanConversation.findById(conversationId)
    .select('pendingMemoryFlush lastMessageAt lastFlushedAt lastFlushReason')
    .lean();

  console.log(`[DAN][TEXT][PENDING][${label}]`, {
    conversationId: String(conversationId),
    pendingMemoryFlush: dbg?.pendingMemoryFlush,
    lastMessageAt: dbg?.lastMessageAt,
    lastFlushedAt: dbg?.lastFlushedAt,
    lastFlushReason: dbg?.lastFlushReason,
  });
}

export async function chatWithDanController(req, res, next) {
  try {
    const authUserId = getAuthUserId(req);
    const { message, type = 'general', conversationId, chequeoId } = req.body || {};

    if (!authUserId || !message) {
      return res.status(400).json({ message: 'Los campos message (y auth userId) son obligatorios.' });
    }

    const user = await User.findById(authUserId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

    let conversation;
    if (conversationId) {
      const convoId = safeObjectId(conversationId);
      if (!convoId) return res.status(400).json({ message: 'conversationId inválido.' });

      conversation = await DanConversation.findOne({ _id: convoId, userId: authUserId });
      if (!conversation) return res.status(404).json({ message: 'Conversación no encontrada.' });
    } else {
      conversation = await DanConversation.create({
        userId: authUserId,
        type,
        chequeoId: chequeoId || undefined,
        pendingMemoryFlush: false,
        lastMessageAt: new Date(),
      });
    }

    // ✅ Guardar mensaje del usuario (siempre)
    const userMessage = await DanMessage.create({
      conversationId: conversation._id,
      role: 'user',
      text: String(message),
    });

    // ✅ Marcar conversación como pending para flush
    await DanConversation.findByIdAndUpdate(
      conversation._id,
      { $set: { pendingMemoryFlush: true, lastMessageAt: new Date() } },
      { new: false }
    );
    await logConversationPendingState(conversation._id, 'after_user_message');

    const chequeos = await Chequeo.find({ owner: authUserId }).sort({ fecha: -1 }).limit(5).lean();

    const ctx = await buildContextPack({
      userId: authUserId,
      messageText: String(message),
      metadata: { channel: 'text', conversationId: String(conversation._id), type: conversation.type },
      tokenBudget: parseInt(process.env.DAN_CONTEXT_BUDGET || '1500', 10),
      topK: parseInt(process.env.DAN_CONTEXT_TOPK || '4', 10),
    });

    const DEBUG = String(process.env.DAN_DEBUG_PROMPTS || 'false').toLowerCase() === 'true';
    const MAX = parseInt(process.env.DAN_DEBUG_MAX_CHARS || '4000', 10);

    if (DEBUG) {
      console.log('==== DAN TEXT REQUEST DEBUG ====');
      console.log('conversationId:', String(conversation._id));
      console.log('userMessage:', String(message).slice(0, MAX));
      console.log('contextPack:', (ctx.contextPack || '').slice(0, MAX));
      console.log('retrievalMode:', ctx.metadata?.retrievalMode);
      console.log('retrievedMemories:', ctx.retrievalDebug);
      console.log('==== END DEBUG ====');
    }

    const reply = await chatWithDan({
      user,
      conversation,
      messageText: String(message),
      chequeos,
      contextPack: ctx.contextPack,
    });

    const assistantMessage = await DanMessage.create({
      conversationId: conversation._id,
      role: 'assistant',
      text: reply.text,
      responseId: reply.responseId,
    });

    // Actualizar conversación (como ya hacías)
    conversation.lastResponseId = reply.responseId;
    conversation.historySummary = reply.historySummary;
    await conversation.save();

    // ✅ También marcamos lastMessageAt (hubo actividad)
    await DanConversation.findByIdAndUpdate(
      conversation._id,
      { $set: { pendingMemoryFlush: true, lastMessageAt: new Date() } },
      { new: false }
    );
    await logConversationPendingState(conversation._id, 'after_assistant_message');

    // ✅ Trigger por N turnos (auto)
    const pipeline = await maybeRunTextMemoryPipeline({
      userId: authUserId,
      conversationId: conversation._id,
    });

    // ✅ Trigger por inactividad (auto)
    scheduleTextMemoryFlush({
      userId: authUserId,
      conversationId: conversation._id,
      idleMs: parseInt(process.env.DAN_TEXT_IDLE_FLUSH_MS || '90000', 10),
      batchUserTurns: parseInt(process.env.DAN_TEXT_SUMMARY_EVERY_N_TURNS || '6', 10),
      minUserTurns: parseInt(process.env.DAN_TEXT_IDLE_MIN_USER_TURNS || '2', 10),
    });

    return res.json({
      conversationId: conversation._id,
      message: reply.text,
      lastResponseId: conversation.lastResponseId,
      historySummary: conversation.historySummary,
      model: reply.model,
      type: conversation.type,
      userMessageId: userMessage._id,
      assistantMessageId: assistantMessage._id,
      retrieval: {
        token_estimate: ctx.tokenEstimate,
        retrieval_debug: ctx.retrievalDebug,
        retrieval_mode: ctx.metadata?.retrievalMode,
      },
      pipeline,
    });
  } catch (error) {
    next(error);
  }
}
