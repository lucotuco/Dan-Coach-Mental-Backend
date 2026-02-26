import { Router } from 'express';
import multer from 'multer';
const authController = require('../controllers/authController');

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);

export default router;