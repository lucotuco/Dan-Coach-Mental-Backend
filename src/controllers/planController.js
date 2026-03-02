import mongoose from 'mongoose';
import { WeeklyPlan, PLAN_AXES } from '../models/Plan.js';
import { Checkin } from '../models/Chequeo.js';
import { User } from '../models/User.js';
import { getWeekStart } from '../services/weekStart.js';

// ---- Helpers ----
function pickLowestAxes(scores, n = 2) {
  const entries = Object.entries(scores)
    .filter(([k]) => PLAN_AXES.includes(k))
    .sort((a, b) => a[1] - b[1]); // menor = peor
  return entries.slice(0, n).map(([k]) => k);
}

function validateAiPlanShape(plan) {
  if (!plan || typeof plan !== 'object') return 'Plan is not an object';
  if (!Array.isArray(plan.focusAxes) || plan.focusAxes.length < 1 || plan.focusAxes.length > 3) {
    return 'focusAxes must be 1-3';
  }
  for (const ax of plan.focusAxes) {
    if (!PLAN_AXES.includes(ax)) return `Invalid axis in focusAxes: ${ax}`;
  }
  if (!Array.isArray(plan.items) || plan.items.length < 4 || plan.items.length > 12) {
    return 'items must be 4-12';
  }
  const ids = new Set();
  for (const it of plan.items) {
    if (!it || typeof it !== 'object') return 'Invalid item object';
    if (typeof it.id !== 'string' || !it.id.trim()) return 'Item.id required';
    if (ids.has(it.id)) return `Duplicate item.id: ${it.id}`;
    ids.add(it.id);

    if (!PLAN_AXES.includes(it.axis)) return `Invalid item.axis: ${it.axis}`;
    if (typeof it.title !== 'string' || !it.title.trim()) return 'Item.title required';
    if (typeof it.description !== 'string' || !it.description.trim()) return 'Item.description required';
  }
  return null;
}

// Fallback si IA falla: checklist simple según ejes más bajos
function fallbackPlanFromScores(scores) {
  const focusAxes = pickLowestAxes(scores, 2);
  const templates = {
    disciplina: [
      { id: 'disc-1', title: 'Plan del día (5 min)', description: 'Definí 1 objetivo principal y 2 secundarios antes de arrancar.' },
      { id: 'disc-2', title: 'Cierre del día (3 min)', description: 'Marcá qué cumpliste y qué vas a ajustar mañana.' },
    ],
    concentracion: [
      { id: 'conc-1', title: 'Bloque sin distracciones (20 min)', description: '20 minutos de foco total sin notificaciones.' },
      { id: 'conc-2', title: 'Reset atencional (2 min)', description: 'Respiración lenta + volver a la tarea principal.' },
    ],
    regulacionEmocional: [
      { id: 're-1', title: 'Registro emocional (2 min)', description: 'Identificá emoción + intensidad + disparador.' },
      { id: 're-2', title: 'Respuesta alternativa', description: 'Elegí 1 acción concreta que harías distinto ante el mismo disparador.' },
    ],
    liderazgo: [
      { id: 'lid-1', title: 'Comunicación clara', description: 'Antes de pedir algo, definí “qué”, “para cuándo” y “cómo se mide”.' },
      { id: 'lid-2', title: 'Feedback corto', description: 'Dale feedback a 1 persona: 1 cosa bien + 1 ajuste concreto.' },
    ],
    confianza: [
      { id: 'conf-1', title: 'Evidencia', description: 'Escribí 3 pruebas de cosas que ya hiciste bien en la semana.' },
      { id: 'conf-2', title: 'Micro-desafío', description: 'Elegí 1 tarea que evitás y hacé el primer paso hoy.' },
    ],
    persistencia: [
      { id: 'pers-1', title: 'Regla del 1%', description: 'Definí un avance mínimo diario (muy fácil) y cumplilo.' },
      { id: 'pers-2', title: 'Seguimiento', description: 'Marcá en la app cada día que cumpliste el mínimo.' },
    ],
    vinculacion: [
      { id: 'vinc-1', title: '1 interacción positiva', description: 'Iniciá una interacción corta con alguien del equipo (pregunta + escucha).' },
      { id: 'vinc-2', title: 'Reconocimiento', description: 'Reconocé un aporte concreto de otra persona.' },
    ],
    superacion: [
      { id: 'sup-1', title: 'Objetivo de estiramiento', description: 'Definí un objetivo ligeramente por encima de lo cómodo.' },
      { id: 'sup-2', title: 'Lección de error', description: 'Anotá 1 error y 1 aprendizaje accionable.' },
    ],
  };

  const items = [];
  for (const ax of focusAxes) {
    const list = templates[ax] || [];
    for (const t of list) items.push({ ...t, axis: ax, done: false, dayHint: null });
  }

  // asegurar mínimo 4 items
  const padded = items.slice(0, 8);
  return { focusAxes, items: padded };
}

// ---- IA hook (implementación tuya) ----
// Esta función la conectás a tu stack (OpenAI, etc.). Debe devolver:
// { focusAxes: [...], items: [{id,axis,title,description}] }
async function generatePlanWithAI({ currentCheckin, lastCheckins, lastPlans }) {
  // ⚠️ Implementación real: acá llamás a tu IA.
  // Para que no te frene, devolvemos null y usamos fallback si no lo conectaste.
  return null;
}

// ---- Controllers ----

export async function generateMyWeeklyPlan(req, res, next) {
  try {
    const baseDate = req.query.date ? new Date(req.query.date) : new Date();
    if (Number.isNaN(baseDate.getTime())) return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD' });

    const weekStart = getWeekStart(baseDate);

    // 1) ya existe? => devolver
    const existing = await WeeklyPlan.findOne({
      teamId: req.user.teamId,
      userId: req.user.userId,
      weekStart,
    });

    if (existing) return res.json({ plan: existing, reused: true });

    // 2) necesita checkin de esa semana
    const currentCheckin = await Checkin.findOne({
      teamId: req.user.teamId,
      userId: req.user.userId,
      weekStart,
    });

    if (!currentCheckin) return res.status(400).json({ error: 'Checkin required for this week' });

    // 3) traer historial compacto
    const lastCheckins = await Checkin.find({
      teamId: req.user.teamId,
      userId: req.user.userId,
      weekStart: { $lt: weekStart },
    })
      .sort({ weekStart: -1 })
      .limit(8)
      .select('weekStart scores');

    const lastPlans = await WeeklyPlan.find({
      teamId: req.user.teamId,
      userId: req.user.userId,
      weekStart: { $lt: weekStart },
    })
      .sort({ weekStart: -1 })
      .limit(4)
      .select('weekStart focusAxes items status');

    // 4) armar snapshot para IA
    const snapshot = {
      current: { weekStart, scores: currentCheckin.scores, notes: currentCheckin.notes || '' },
      history: lastCheckins.map((c) => ({ weekStart: c.weekStart, scores: c.scores })),
      plans: lastPlans.map((p) => ({
        weekStart: p.weekStart,
        focusAxes: p.focusAxes,
        status: p.status,
        completionPct: p.items?.length
          ? Number(((p.items.filter((i) => i.done).length / p.items.length) * 100).toFixed(1))
          : 0,
        topDone: (p.items || []).filter((i) => i.done).slice(0, 3).map((i) => i.title),
        topMissed: (p.items || []).filter((i) => !i.done).slice(0, 3).map((i) => i.title),
      })),
    };

    // 5) IA
    let aiPlan = await generatePlanWithAI({
      currentCheckin: snapshot.current,
      lastCheckins: snapshot.history,
      lastPlans: snapshot.plans,
    });

    // 6) validar o fallback
    if (aiPlan) {
      const err = validateAiPlanShape(aiPlan);
      if (err) aiPlan = null;
    }
    if (!aiPlan) {
      aiPlan = fallbackPlanFromScores(currentCheckin.scores);
    }

    // 7) persistir (idempotencia con unique index)
    const planDoc = {
      teamId: req.user.teamId,
      userId: req.user.userId,
      weekStart,
      generatedFromCheckinId: currentCheckin._id,
      focusAxes: aiPlan.focusAxes,
      items: aiPlan.items.map((it) => ({
        id: String(it.id).trim(),
        axis: it.axis,
        title: String(it.title).trim(),
        description: String(it.description).trim(),
        done: false,
        dayHint: it.dayHint ?? null,
      })),
      status: 'active',
      inputsSnapshot: snapshot,
      aiMeta: { promptVersion: 'v1' },
    };

    let created;
    try {
      created = await WeeklyPlan.create(planDoc);
    } catch (e) {
      if (String(e.code) === '11000') {
        // otro request lo creó en paralelo
        const again = await WeeklyPlan.findOne({ teamId: req.user.teamId, userId: req.user.userId, weekStart });
        return res.json({ plan: again, reused: true });
      }
      throw e;
    }

    return res.status(201).json({ plan: created, reused: false });
  } catch (err) {
    return next(err);
  }
}

export async function getMyCurrentPlan(req, res, next) {
  try {
    const weekStart = getWeekStart(new Date());
    const plan = await WeeklyPlan.findOne({
      teamId: req.user.teamId,
      userId: req.user.userId,
      weekStart,
    });
    return res.json({ plan: plan || null });
  } catch (err) {
    return next(err);
  }
}

// PATCH: marcar done/undone
export async function setItemDone(req, res, next) {
  try {
    const itemId = String(req.params.itemId || '').trim();
    if (!itemId) return res.status(400).json({ error: 'itemId required' });

    const done = Boolean(req.body.done);

    const weekStart = getWeekStart(new Date());

    const plan = await WeeklyPlan.findOne({
      teamId: req.user.teamId,
      userId: req.user.userId,
      weekStart,
    });

    if (!plan) return res.status(404).json({ error: 'Plan not found for current week' });

    const item = plan.items.find((i) => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    item.done = done;

    // si todos done => completed
    const allDone = plan.items.length > 0 && plan.items.every((i) => i.done);
    plan.status = allDone ? 'completed' : 'active';

    await plan.save();

    return res.json({ ok: true, status: plan.status, items: plan.items });
  } catch (err) {
    return next(err);
  }
}

export async function teamWeekPlans(req, res, next) {
  try {
    const baseDate = req.query.date ? new Date(req.query.date) : new Date();
    if (Number.isNaN(baseDate.getTime())) return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD' });
    const weekStart = getWeekStart(baseDate);

    const teamId = new mongoose.Types.ObjectId(req.user.teamId);

    const plans = await WeeklyPlan.find({ teamId, weekStart })
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 });

    return res.json({ weekStart, plans });
  } catch (err) {
    return next(err);
  }
}