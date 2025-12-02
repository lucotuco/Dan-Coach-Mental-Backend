import { Router } from 'express';
import multer from 'multer';
import { createUser, listUsers,getUser,loginUser,updateUser } from '../controllers/userController.js';

const router = Router();
const upload = multer();

router.get('/', listUsers);
router.post('/', createUser);
router.get('/:id', getUser);
router.post('/login', loginUser);
router.post('/cargarInfo', upload.single('audio'),updateUser)

export default router;
