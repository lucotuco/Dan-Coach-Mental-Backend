// src/routes/realtimeRoutes.js
import express from "express";
import { createRealtimeClientSecret } from "../controllers/realtimeController.js";
import { requireAuth } from "../middleware/requireAuth.js"; // asumido por tu proyecto

const router = express.Router();

// IMPORTANTE: mantené auth para que no cualquiera genere sessions con tu key
router.post("/client-secret", requireAuth, createRealtimeClientSecret);

export default router;
