// src/routes/didRoutes.js
import { Router } from 'express';
import { getDidConfig, proxyIdleVideo } from '../controllers/didController.js';

const router = Router();

router.get('/config', getDidConfig);
router.get('/idle-video', proxyIdleVideo);

export default router;
