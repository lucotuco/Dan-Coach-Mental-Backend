import { Router } from 'express';
import { createUser, listUsers,getUser } from '../controllers/userController.js';

const router = Router();

router.get('/', listUsers);
router.post('/', createUser);
router.get("/:id", getUser);

export default router;
