// src/routes/didRoutes.js
import { Router } from 'express';
import { getDidConfig, proxyIdleVideo } from '../controllers/didController.js';

const router = Router();

router.get('/config', getDidConfig);

// ✅ NUEVO: proxy idle video
router.get('/idle-video', proxyIdleVideo);
router.head('/idle-video', proxyIdleVideo);

export default router;
