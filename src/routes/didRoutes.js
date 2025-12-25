import { Router } from 'express';
import { getDidConfig } from '../controllers/didController.js';

const router = Router();
router.get('/config', getDidConfig);

export default router;
