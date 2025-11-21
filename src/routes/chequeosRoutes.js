import { Router } from 'express';
import { createCheck } from '../controllers/chequeosController.js';

const router = Router();

router.post('/', createCheck);

export default router;
