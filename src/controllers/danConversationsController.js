import mongoose from 'mongoose';
import { DanConversation } from '../models/DanConversation.js';
import { DanMessage } from '../models/DanMessage.js';

function safeObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

// POST /api/dan/conversations  -> crea un chat nuevo
export async function createConversation(req, res, next) {
  try {
    const userId = req.user?.userId;
    const { type = 'general', chequeoId } = req.body || {};
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const convo = await DanConversation.create({
      userId,
      type,
      chequeoId: chequeoId || undefined,
    });

    return res.status(201).json({ conversationId: convo._id, type: convo.type });
  } catch (e) {
    next(e);
  }
}

// GET /api/dan/conversations -> lista chats del usuario
export async function listConversations(req, res, next) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);

    const convos = await DanConversation.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    // mini preview: último mensaje del usuario o asistente
    const ids = convos.map((c) => c._id);
    const lastMsgs = await DanMessage.aggregate([
      { $match: { conversationId: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$conversationId',
          lastText: { $first: '$text' },
          lastRole: { $first: '$role' },
          lastAt: { $first: '$createdAt' },
        },
      },
    ]);

    const map = new Map(lastMsgs.map((m) => [String(m._id), m]));
    const payload = convos.map((c) => {
      const last = map.get(String(c._id));
      return {
        _id: c._id,
        type: c.type,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
        preview: last?.lastText ? String(last.lastText).slice(0, 80) : '',
        previewRole: last?.lastRole || null,
        lastAt: last?.lastAt || null,
      };
    });

    return res.json({ conversations: payload });
  } catch (e) {
    next(e);
  }
}

// GET /api/dan/conversations/:id/messages -> carga mensajes del chat
export async function getConversationMessages(req, res, next) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const convoId = safeObjectId(req.params.id);
    if (!convoId) return res.status(400).json({ message: 'conversationId inválido.' });

    const convo = await DanConversation.findOne({ _id: convoId, userId }).lean();
    if (!convo) return res.status(404).json({ message: 'Conversación no encontrada.' });

    const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);

    const msgs = await DanMessage.find({ conversationId: convoId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    return res.json({
      conversation: { _id: convo._id, type: convo.type, createdAt: convo.createdAt, updatedAt: convo.updatedAt },
      messages: msgs.map((m) => ({
        _id: m._id,
        role: m.role,
        text: m.text,
        createdAt: m.createdAt,
      })),
      lastResponseId: convo.lastResponseId || null,
      historySummary: convo.historySummary || null,
    });
  } catch (e) {
    next(e);
  }
}
