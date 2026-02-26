import { Router } from 'express';
import multer from 'multer';
import {
  listUsers,
  getUser,
  getMe,
  updateUser,
  updateUserGoalA,
  updateUserGoalT,
} from '../controllers/userController.js';

const router = Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });


router.get('/me', getMe);
router.get('/', listUsers);
router.post('/cargarInfo', updateUser);
router.post('/metaAudio', upload.single('audio'), updateUserGoalA);
router.post('/metaTexto', updateUserGoalT);

// Parametrizadas al final
router.get('/:id', getUser);

export default router;