import { Router } from 'express';
import { createCheck, listChecksByTypeAndOwner } from '../controllers/chequeosController.js';

const router = Router();

router.get('/', listChecksByTypeAndOwner);
router.post('/', createCheck);

export default router;
