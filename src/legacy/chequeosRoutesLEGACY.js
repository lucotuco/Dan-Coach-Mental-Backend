import { Router } from 'express';
import multer from 'multer';
import { createCheck, listChecksByTypeAndOwner } from '../controllers/chequeosController.js';
const router = Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get('/', listChecksByTypeAndOwner);
router.post('/', upload.single('audio'), createCheck);
export default router;