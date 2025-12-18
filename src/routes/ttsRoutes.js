import { Router } from 'express';
import { createTtsAudio, serveTtsAudio, uploadAudio } from '../controllers/ttsController.js';

const router = Router();

// Protegido (requiere Bearer): generar mp3 desde texto (tu endpoint actual)
router.post('/', createTtsAudio);

// +++ NUEVO: Protegido (requiere Bearer): subir audio ya generado (Realtime)
router.post('/upload', uploadAudio);

// Público: servir audio para D-ID
router.get('/:file', serveTtsAudio);

export default router;
