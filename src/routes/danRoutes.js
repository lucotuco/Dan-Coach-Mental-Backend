import { Router } from 'express';
import { chatWithDanController } from '../controllers/danController.js';
import { handleSessionEnd, handleContextPack } from '../controllers/memoryController.js';
import {
  createConversation,
  listConversations,
  getConversationMessages,
  appendConversationMessage,
  endConversation,
  updateConversation,     // ✅ nuevo
  deleteConversation,     // ✅ nuevo
} from '../controllers/danConversationsController.js';

const router = Router();

// Conversaciones tipo ChatGPT
router.post('/conversations', createConversation);
router.get('/conversations', listConversations);
router.get('/conversations/:id/messages', getConversationMessages);

// Opción 1: append mensajes
router.post('/conversations/:id/messages', appendConversationMessage);

// ✅ “Guardar / cerrar” conversación: genera título si falta
router.post('/conversations/:id/end', endConversation);

// ✅ rename/pin
router.patch('/conversations/:id', updateConversation);

// ✅ soft delete
router.delete('/conversations/:id', deleteConversation);

// Chat principal (texto “clásico”)
router.post('/chat', chatWithDanController);

// Memoria (lo tuyo)
router.post('/session-end', handleSessionEnd);
router.post('/context-pack', handleContextPack);

export default router;