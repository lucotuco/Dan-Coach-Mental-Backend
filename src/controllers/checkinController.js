import mongoose from 'mongoose';
import { Checkin, CHECKIN_AXES } from '../models/Chequeo.js';
import { User } from '../models/User.js';
import { getWeekStart } from '../services/weekStart.js';

function isAnswerArrayValid(arr, minQuestionsPerAxis = 3) {
  if (!Array.isArray(arr)) return false;
  if (arr.length < minQuestionsPerAxis) return false;

  for (const item of arr) {
    if (!item || typeof item.qid !== 'string' || !item.qid.trim()) return false;
    if (typeof item.value !== 'number' || Number.isNaN(item.value)) return false;
    if (item.value < 1 || item.value > 10) return false;
  }
  return true;
}

function computeAxisScore(arr) {
  const sum = arr.reduce((s, x) => s + x.value, 0);
  return Number((sum / arr.length).toFixed(2));
}

export async function createCheckin(req, res, next) {
  try {
    const answers = req.body.answers;
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers required' });
    }

    // ✅ exigir los 8 ejes
    for (const axis of CHECKIN_AXES) {
      if (!Object.prototype.hasOwnProperty.call(answers, axis)) {
        return res.status(400).json({ error: `Missing axis: ${axis}` });
      }
      if (!isAnswerArrayValid(answers[axis], 3)) {
        return res.status(400).json({ error: `Axis ${axis} incomplete or invalid` });
      }
    }

    // ✅ calcular scores
    const scores = {};
    for (const axis of CHECKIN_AXES) {
      scores[axis] = computeAxisScore(answers[axis]);
    }

    const weekStart = getWeekStart(new Date());

    try {
      const created = await Checkin.create({
        teamId: req.user.teamId,
        userId: req.user.userId,
        weekStart,
        answers,
        scores,
        notes: String(req.body.notes || '').trim(),
      });

      return res.status(201).json({ checkin: created });
    } catch (e) {
      if (String(e.code) === '11000') {
        return res.status(409).json({ error: 'Check-in already exists for this week' });
      }
      throw e;
    }
  } catch (err) {
    return next(err);
  }
}


// 1) Listar mis checkins
export async function listMyCheckins(req, res, next) {
  try {
    const includeAnswers = String(req.query.includeAnswers || 'false') === 'true';

    const query = { teamId: req.user.teamId, userId: req.user.userId };
    const projection = includeAnswers ? {} : { answers: 0 }; // si no pide answers, no lo mandes

    const items = await Checkin.find(query, projection)
      .sort({ weekStart: -1 })
      .limit(50);

    return res.json({ items });
  } catch (err) {
    return next(err);
  }
}

// 2) Checkin de la semana actual
export async function getMyCurrentCheckin(req, res, next) {
  try {
    const weekStart = getWeekStart(new Date());

    const item = await Checkin.findOne({
      teamId: req.user.teamId,
      userId: req.user.userId,
      weekStart,
    });

    return res.json({ item: item || null });
  } catch (err) {
    return next(err);
  }
}

export async function teamWeek(req, res, next) {
  try {
    const dateStr = req.query.date;        // <-- nuevo
    const weekStartStr = req.query.weekStart; // <-- legacy (opcional)

    let baseDate;
    if (dateStr) {
      baseDate = new Date(dateStr);
    } else if (weekStartStr) {
      baseDate = new Date(weekStartStr);
    } else {
      baseDate = new Date();
    }

    if (Number.isNaN(baseDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD' });
    }

    const weekStart = getWeekStart(baseDate);
    const teamId = new mongoose.Types.ObjectId(req.user.teamId);

    const items = await Checkin.find({ teamId, weekStart }, { answers: 0 })
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 });

    const groupStage = CHECKIN_AXES.reduce((acc, axis) => {
      acc[axis] = { $avg: `$scores.${axis}` };
      return acc;
    }, { _id: null });

    const agg = await Checkin.aggregate([
      { $match: { teamId, weekStart } },
      { $group: groupStage },
    ]);

    const totalMembers = await User.countDocuments({ teamId });
    const completed = items.length;

    return res.json({
      weekStart,
      items,
      teamAverages: agg[0] || null,
      completion: {
        completed,
        total: totalMembers,
        pct: totalMembers ? Number(((completed / totalMembers) * 100).toFixed(1)) : 0,
      },
    });
  } catch (err) {
    return next(err);
  }
}