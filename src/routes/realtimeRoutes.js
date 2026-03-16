// src/routes/realtimeRoutes.js
import { Router } from 'express';
import {
  getRealtimeClientSecret,
  postTopicShiftCheck,
  postRealtimeSessionSave,
  postRealtimeSessionEnd,
  saveRealtimeSessionSummary,
  getRealtimeSessions,
  getRealtimeCheckups,
  getRealtimeMemberContext
} from '../controllers/realtimeController.js';

const router = Router();

router.get('/client-secret', getRealtimeClientSecret);
router.post('/topic-shift', postTopicShiftCheck);

// ✅ autosave sin OpenAI
router.post('/session-save', postRealtimeSessionSave);

// ✅ final con pipeline OpenAI
router.post('/session-end', postRealtimeSessionEnd);

// Compat tool vieja
router.post('/sessions', saveRealtimeSessionSummary);

router.get('/sessions', getRealtimeSessions);
router.get('/checkups', getRealtimeCheckups);
router.get('/member-context', getRealtimeMemberContext);


export default router;
