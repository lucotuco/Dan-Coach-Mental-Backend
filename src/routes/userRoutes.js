import { Router } from 'express';
import { createUser, listUsers,getUser,loginUser } from '../controllers/userController.js';

const router = Router();

router.get('/', listUsers);
router.post('/', createUser);
router.get("/:id", getUser);
router.get('/login', loginUser);

export default router;
