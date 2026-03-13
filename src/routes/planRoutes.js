import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import requireRole from '../middleware/requireRole.js';
import requireTeam from '../middleware/requireTeam.js';

import {
  generateMyWeeklyPlan,
  getMyCurrentPlan,
  setItemDone,
  teamWeekPlans,
  listMyPlans,
} from '../controllers/planController.js';

const router = Router();

router.post('/generate', authMiddleware, requireTeam(), requireRole(['member', 'coach']), generateMyWeeklyPlan);
router.get('/me/current', authMiddleware, requireTeam(), requireRole(['member', 'coach']), getMyCurrentPlan);
router.patch('/me/current/items/:itemId', authMiddleware, requireTeam(), requireRole(['member', 'coach']), setItemDone);
router.get('/me',authMiddleware,requireTeam(), requireRole(['member', 'coach']), listMyPlans); // alias para dashboard
// coach dashboard
router.get('/team-week', authMiddleware, requireTeam(), requireRole('coach'), teamWeekPlans);

export default router;