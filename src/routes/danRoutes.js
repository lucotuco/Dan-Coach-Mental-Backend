import { Router } from 'express';
import { chatWithDanController } from '../controllers/danController.js';
import { handleSessionEnd, handleContextPack } from '../controllers/memoryController.js';
import {
  createConversation,
  listConversations,
  getConversationMessages,
} from '../controllers/danConversationsController.js';

const router = Router();

// ✅ Conversaciones tipo ChatGPT
router.post('/conversations', createConversation);
router.get('/conversations', listConversations);
router.get('/conversations/:id/messages', getConversationMessages);

// Chat principal
router.post('/chat', chatWithDanController);

// Memoria (lo tuyo)
router.post('/session-end', handleSessionEnd);
router.post('/context-pack', handleContextPack);

export default router;
