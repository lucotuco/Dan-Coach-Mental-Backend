import { Router } from 'express';
import { chatWithDanController } from '../controllers/danController.js';

const router = Router();

router.post('/chat', chatWithDanController);

export default router;
