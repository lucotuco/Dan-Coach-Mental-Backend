import { Router } from 'express';
import { uploadAudio, serveTtsAudio } from '../controllers/ttsController.js';

const router = Router();

// Protegido (requiere Bearer): subir audio ya generado (Realtime)
router.post('/upload', uploadAudio);

// Público: servir audio para D-ID (incluye HEAD para validación)
router.get('/:file', serveTtsAudio);
router.head('/:file', serveTtsAudio);

export default router;
