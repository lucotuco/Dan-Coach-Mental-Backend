import { Router } from 'express';
import multer from 'multer';
import { createUser, listUsers,getUser,loginUser,updateUser,updateUserGoalA,updateUserGoalT } from '../controllers/userController.js';

const router = Router();
const upload = multer();

router.get('/', listUsers);
router.post('/', createUser);
router.get('/:id', getUser);
router.post('/login', loginUser);
router.post('/cargarInfo',updateUser);
router.post('/meta/Audio', upload.single('audio'),updateUserGoalA);
router.post('/metaTexto',updateUserGoalT)

export default router;
