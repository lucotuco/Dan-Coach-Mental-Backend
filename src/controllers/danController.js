import { DanConversation } from '../models/DanConversation.js';
import { DanMessage } from '../models/DanMessage.js';
import { User } from '../models/User.js';
import { chatWithDan } from '../services/danCoach.js';
import { Chequeo } from '../models/Chequeo.js';
import { buildContextPack } from '../services/memoryService.js';

function getAuthUserId(req) {
  // soporta distintos shapes de JWT
  return (
    req.user?.id ||
    req.user?._id ||
    req.user?.userId ||
    req.user?.sub ||
    null
  );
}

export async function chatWithDanController(req, res, next) {
  try {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return res.status(401).json({ message: 'Token inválido o faltante.' });
    }

    const { userId: bodyUserId, message, type = 'general', conversationId, chequeoId } =
      req.body || {};

    if (!message) {
      return res.status(400).json({ message: 'El campo message es obligatorio.' });
    }

    // Evita que un usuario escriba/lea con otro userId
    if (bodyUserId && String(bodyUserId) !== String(authUserId)) {
      return res.status(403).json({ message: 'userId no coincide con el token.' });
    }

    const userId = authUserId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    let conversation;

    if (conversationId) {
      conversation = await DanConversation.findOne({
        _id: conversationId,
        userId,
      });
    } else {
      conversation = await DanConversation.findOne({ userId, type }).sort({
        createdAt: -1,
      });
    }

    if (!conversation) {
      conversation = await DanConversation.create({ userId, type, chequeoId });
    } else if (chequeoId && !conversation.chequeoId) {
      conversation.chequeoId = chequeoId;
      await conversation.save();
    }

    const userMessage = await DanMessage.create({
      conversationId: conversation._id,
      role: 'user',
      text: message,
    });

    const chequeos = await Chequeo.find({ owner: userId })
      .sort({ fecha: -1 })
      .limit(5);

    // ✅ Construye memoria personalizada (RAG + perfil + last summary + brief)
    const contextResult = await buildContextPack({
      userId,
      messageText: message,
      metadata: { type, chequeoId },
      tokenBudget: undefined,
      topK: undefined,
    });

    const reply = await chatWithDan({
      user,
      conversation,
      messageText: message,
      chequeos,
      contextPack: contextResult.contextPack,
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

    if (!user.danCurrentConversationId?.equals(conversation._id)) {
      user.danCurrentConversationId = conversation._id;
      await user.save();
    }

    return res.json({
      conversationId: conversation._id,
      message: reply.text,
      lastResponseId: conversation.lastResponseId,
      historySummary: conversation.historySummary,
      model: reply.model,
      type: conversation.type,
      userMessageId: userMessage._id,
      assistantMessageId: assistantMessage._id,

      // opcional: debug de retrieval si querés exponerlo (yo lo dejaría oculto en prod)
      // memoryTokenEstimate: contextResult.tokenEstimate,
    });
  } catch (error) {
    next(error);
  }
}
