import mongoose from 'mongoose';
import { DanConversation } from '../models/DanConversation.js';
import { DanMessage } from '../models/DanMessage.js';

function safeObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

// POST /api/dan/conversations -> crea un chat nuevo (vacío)
export async function createConversation(req, res, next) {
  try {
    const userId = req.user?.userId;
    const { type = 'general', chequeoId } = req.body || {};
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const convo = await DanConversation.create({
      userId,
      type,
      chequeoId: chequeoId || undefined,
      lastMessageAt: null, // ✅ clave: no cuenta como “visible” hasta que haya mensajes
      pendingMemoryFlush: false,
      title: '',
      pinned: false,
      pinnedAt: null,
      deletedAt: null,
    });

    return res.status(201).json({ conversationId: convo._id, type: convo.type });
  } catch (e) {
    next(e);
  }
}

// ✅ POST /api/dan/conversations/:id/messages -> append 1 mensaje
export async function appendConversationMessage(req, res, next) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const convoId = safeObjectId(req.params.id);
    if (!convoId) return res.status(400).json({ message: 'conversationId inválido.' });

    const { role, text, responseId } = req.body || {};
    const cleanRole = String(role || '').trim();
    const cleanText = String(text || '').trim();

    if (!['user', 'assistant', 'system'].includes(cleanRole)) {
      return res.status(400).json({ message: 'role inválido (user|assistant|system).' });
    }
    if (!cleanText) {
      return res.status(400).json({ message: 'text es obligatorio.' });
    }

    // validar ownership + no borrada
    const convo = await DanConversation.findOne({ _id: convoId, userId, deletedAt: null });
    if (!convo) return res.status(404).json({ message: 'Conversación no encontrada.' });

    const msg = await DanMessage.create({
      conversationId: convoId,
      role: cleanRole,
      text: cleanText,
      responseId: responseId ? String(responseId) : undefined,
    });

    // actualizar actividad (para ordenar y para reconciler)
    await DanConversation.findByIdAndUpdate(convoId, {
      $set: {
        lastMessageAt: new Date(),
        pendingMemoryFlush: true,
      },
    });

    return res.status(201).json({ ok: true, messageId: msg._id });
  } catch (e) {
    next(e);
  }
}

// ✅ PATCH /api/dan/conversations/:id -> rename / pin / unpin
export async function updateConversation(req, res, next) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const convoId = safeObjectId(req.params.id);
    if (!convoId) return res.status(400).json({ message: 'conversationId inválido.' });

    const { title, pinned } = req.body || {};

    const convo = await DanConversation.findOne({ _id: convoId, userId, deletedAt: null });
    if (!convo) return res.status(404).json({ message: 'Conversación no encontrada.' });

    const $set = {};

    if (typeof title === 'string') {
      $set.title = title.trim().slice(0, 80); // límite simple
    }

    if (typeof pinned === 'boolean') {
      $set.pinned = pinned;
      $set.pinnedAt = pinned ? new Date() : null;
    }

    const updated = await DanConversation.findByIdAndUpdate(
      convoId,
      { $set },
      { new: true }
    ).lean();

    return res.json({
      ok: true,
      conversation: {
        _id: updated._id,
        title: updated.title || '',
        pinned: !!updated.pinned,
        pinnedAt: updated.pinnedAt || null,
        lastMessageAt: updated.lastMessageAt || null,
      },
    });
  } catch (e) {
    next(e);
  }
}

// ✅ DELETE /api/dan/conversations/:id -> soft delete
export async function deleteConversation(req, res, next) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const convoId = safeObjectId(req.params.id);
    if (!convoId) return res.status(400).json({ message: 'conversationId inválido.' });

    const convo = await DanConversation.findOne({ _id: convoId, userId, deletedAt: null });
    if (!convo) return res.status(404).json({ message: 'Conversación no encontrada.' });

    await DanConversation.findByIdAndUpdate(convoId, {
      $set: { deletedAt: new Date() },
    });

    return res.json({ ok: true });
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

    // ✅ Solo conversaciones “no vacías” y no borradas
    const convos = await DanConversation.find({
      userId,
      deletedAt: null,
      lastMessageAt: { $ne: null },
    })
      .sort({ pinned: -1, pinnedAt: -1, lastMessageAt: -1, updatedAt: -1 })
      .limit(limit)
      .lean();

    const payload = convos.map((c) => ({
      _id: c._id,
      title: c.title || '',
      pinned: !!c.pinned,
      pinnedAt: c.pinnedAt || null,
      type: c.type,
      updatedAt: c.updatedAt,
      createdAt: c.createdAt,
      lastMessageAt: c.lastMessageAt || null,
    }));

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

    const convo = await DanConversation.findOne({ _id: convoId, userId, deletedAt: null }).lean();
    if (!convo) return res.status(404).json({ message: 'Conversación no encontrada.' });

    // ✅ límite default 60 (lo que pediste)
    const limit = Math.min(parseInt(req.query.limit || '60', 10), 500);

    const msgs = await DanMessage.find({ conversationId: convoId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    return res.json({
      conversation: {
        _id: convo._id,
        type: convo.type,
        title: convo.title || '',
        pinned: !!convo.pinned,
        createdAt: convo.createdAt,
        updatedAt: convo.updatedAt,
        lastMessageAt: convo.lastMessageAt || null,
      },
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
