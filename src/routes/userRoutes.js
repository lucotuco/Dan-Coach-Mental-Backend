import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { getMe, updateMe } from '../controllers/userController.js';

const router = Router();

router.get('/me', authMiddleware, getMe);
router.patch('/me', authMiddleware, updateMe);

export default router;