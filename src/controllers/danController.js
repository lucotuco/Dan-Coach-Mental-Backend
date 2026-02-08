// src/controllers/danController.js
import mongoose from 'mongoose';
import { DanConversation } from '../models/DanConversation.js';
import { DanMessage } from '../models/DanMessage.js';
import { User } from '../models/User.js';
import { chatWithDan } from '../services/danCoach.js';
import { Chequeo } from '../models/Chequeo.js';

import {
  buildContextPack,
  saveSessionTranscript,
  createSessionSummary,
  updateUserProfileFromTranscript,
  createMemoryItemsFromSummary,
  refreshLongTermBriefIfNeeded,
} from '../services/memoryService.js';

function getAuthUserId(req) {
  return req.user?.userId || req.user?.id || req.user?._id || req.user?.sub || null;
}

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

async function maybeRunTextMemoryPipeline({ userId, conversationId }) {
  const N = Math.max(parseInt(process.env.DAN_TEXT_SUMMARY_EVERY_N_TURNS || '6', 10), 2);

  const userTurns = await DanMessage.countDocuments({
    conversationId,
    role: 'user',
  });

  if (userTurns === 0 || userTurns % N !== 0) return { ran: false };

  const lastMsgs = await DanMessage.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(N * 2)
    .select('role text createdAt')
    .lean();

  const ordered = lastMsgs.reverse();
  const transcript = buildTranscriptFromMessages(ordered);

  const sessionId = `text:${String(conversationId)}:${userTurns}`;
  const metadata = { channel: 'text', conversationId: String(conversationId), userTurns, batchSize: N };

  await saveSessionTranscript({ userId, sessionId, transcript, metadata });
  const summaryDoc = await createSessionSummary({ userId, sessionId, transcript });
  const profileResult = await updateUserProfileFromTranscript({ userId, transcript });
  const memoryResult = await createMemoryItemsFromSummary({ userId, sessionId, summary: summaryDoc });
  const longTermResult = await refreshLongTermBriefIfNeeded({ userId, force: false });

  return {
    ran: true,
    sessionId,
    summaryId: summaryDoc?._id,
    user_profile_updated: profileResult.updated,
    memory_items_created: memoryResult.created,
    long_term_brief_updated: longTermResult.updated,
  };
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
      });
    }

    const userMessage = await DanMessage.create({
      conversationId: conversation._id,
      role: 'user',
      text: String(message),
    });

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

    conversation.lastResponseId = reply.responseId;
    conversation.historySummary = reply.historySummary;
    await conversation.save();

    const pipeline = await maybeRunTextMemoryPipeline({
      userId: authUserId,
      conversationId: conversation._id,
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
