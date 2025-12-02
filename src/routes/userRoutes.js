import { Router } from 'express';
import { createUser, listUsers,getUser,loginUser,updateUser } from '../controllers/userController.js';

const router = Router();

router.get('/', listUsers);
router.post('/', createUser);
router.get('/:id', getUser);
router.post('/login', loginUser);
router.post('/cargarInfo',updateUser)

export default router;
