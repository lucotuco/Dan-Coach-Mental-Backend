// src/routes/ttsRoutes.js
import { Router } from "express";
import { createTts, getTtsFile } from "../controllers/ttsController.js";

const router = Router();

// POST podés protegerlo con JWT si querés:
// router.post("/", requireAuth, createTts);
router.post("/", createTts);

// GET NO lo protejas con JWT: D-ID necesita bajarlo.
router.get("/:id.mp3", getTtsFile);

export default router;
