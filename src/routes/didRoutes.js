// src/routes/didRoutes.js
import { Router } from "express";
import { getDidConfig, getDidCredits } from "../controllers/didController.js";

const router = Router();

// Opcional: si querés protegerlo con JWT, aplicá tu middleware acá.
// router.use(requireAuth);

router.get("/config", getDidConfig);
router.get("/credits", getDidCredits);

export default router;
