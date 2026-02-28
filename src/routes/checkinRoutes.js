import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import requireRole from '../middleware/requireRole.js';
import requireTeam from '../middleware/requireTeam.js';

import {
  createCheckin,
  listMyCheckins,
  getMyCurrentCheckin,
  teamWeek,
} from '../controllers/checkinsController.js';

const router = Router();

router.post('/', authMiddleware, requireTeam(), requireRole(['member', 'coach']), createCheckin);
router.get('/me', authMiddleware, requireTeam(), requireRole(['member', 'coach']), listMyCheckins);
router.get('/me/current', authMiddleware, requireTeam(), requireRole(['member', 'coach']), getMyCurrentCheckin);

router.get('/team-week', authMiddleware, requireTeam(), requireRole('coach'), teamWeek);

export default router;