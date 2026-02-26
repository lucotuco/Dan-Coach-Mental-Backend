import { Router } from 'express';
import multer from 'multer';
import {register,login} from '../controllers/authController';

const router = Router();

router.post('/register', register);
router.post('/login', login);

export default router;