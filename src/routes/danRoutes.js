import { Router } from 'express';
import { chatWithDanController } from '../controllers/danController.js';
import {
  handleSessionEnd,
  handleContextPack,
} from '../controllers/memoryController.js';

const router = Router();

router.post('/chat', chatWithDanController);
router.post('/session-end', handleSessionEnd);
router.post('/context-pack', handleContextPack);

export default router;
