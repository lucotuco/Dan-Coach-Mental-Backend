import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import requireRole from '../middleware/requireRole.js';
import requireTeam from '../middleware/requireTeam.js';

import {
  createTeam,
  getMyTeam,
  updateMyTeam,
  listMembers,
  addMemberByEmail,
  removeMember,
  joinByCode,
} from '../controllers/teamController.js';

const router = Router();

router.post('/', authMiddleware, requireRole('coach'), createTeam);

router.get('/me', authMiddleware, getMyTeam);
router.patch('/me', authMiddleware, requireTeam(), requireRole('coach'), updateMyTeam);

router.post('/join', authMiddleware, requireRole(['member', 'coach']), joinByCode);

router.get('/me/members', authMiddleware, requireTeam(), requireRole('coach'), listMembers);
router.post('/me/members', authMiddleware, requireTeam(), requireRole('coach'), addMemberByEmail);
router.patch('/me/members/:memberUserId/remove', authMiddleware, requireTeam(), requireRole('coach'), removeMember);

export default router;