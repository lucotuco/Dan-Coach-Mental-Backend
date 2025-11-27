import { Router } from 'express';
import multer from 'multer';
import { createCheck, listChecksByTypeAndOwner } from '../controllers/chequeosController.js';

const upload = multer({ dest: 'uploads/' });

const router = Router();

router.get('/', listChecksByTypeAndOwner);
router.post('/', upload.single('audio'), createCheck);

export default router;
