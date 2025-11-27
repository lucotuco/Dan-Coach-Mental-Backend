import { DanConversation } from '../models/DanConversation.js';
import { DanMessage } from '../models/DanMessage.js';
import { User } from '../models/User.js';
import { chatWithDan } from '../services/danCoach.js';
import { Chequeo } from '../models/Chequeo.js';

export async function chatWithDanController(req, res, next) {
  try {
    const { userId, message, type = 'general', conversationId, chequeoId } =
      req.body || {};

    if (!userId || !message) {
      return res
        .status(400)
        .json({ message: 'Los campos userId y message son obligatorios.' });
    }

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
    }

    const userMessage = await DanMessage.create({
      conversationId: conversation._id,
      role: 'user',
      text: message,
    });

    const chequeos = await Chequeo.find({ owner: userId })
      .sort({ fecha: -1 })
      .limit(5);

    const reply = await chatWithDan({
      user,
      conversation,
      messageText: message,
      chequeos,
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
    });
  } catch (error) {
    next(error);
  }
}
