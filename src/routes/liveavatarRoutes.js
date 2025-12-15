import { Router } from "express";
import { getLiveAvatarSession } from "../controllers/liveavatarController.js";
// import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

// router.get("/session", authMiddleware, getLiveAvatarSession);
router.get("/session", getLiveAvatarSession);

export default router;
