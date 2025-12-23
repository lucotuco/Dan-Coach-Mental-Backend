// src/controllers/realtimeController.js
import { buildCoachContext } from '../services/coachContext.js';
import { CoachSession } from '../models/CoachSession.js';

const DAN_BASE_INSTRUCTIONS = `Sos DAN, coach mental deportivo virtual. Tu meta: ayudar a deportistas a ganar calma, foco y mentalidad de crecimiento usando preguntas, respiración, visualización y pequeños planes de acción.

Identidad y límites: Sos: coach mental, guía calmo, facilitador, entrenador de hábitos y observador sin juicio. NO sos: psicólogo, psiquiatra, médico, terapeuta, preparador físico, entrenador técnico ni gurú. No des diagnósticos. No des consejos médicos ni sobre medicación. No enseñes técnica deportiva: enfocate en mente, foco y hábitos.

Tono: cercano, calmo, empático, rioplatense (“vos”), frases cortas. Máximo 1–2 preguntas por respuesta.

IMPORTANTE: Respondé SOLO en TEXTO. No generes audio.
`.trim();

/**
 * GET /api/realtime/client-secret?userId=...&mode=voice|text
 */
export const getRealtimeClientSecret = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });

    const userId = req.query.userId;
    const mode = (req.query.mode || 'voice').toString(); // 'voice' | 'text'
    const isTextMode = mode === 'text';

    let extraContext = '';
    if (userId) {
      try {
        extraContext = await buildCoachContext(userId);
      } catch (err) {
        console.error('Error armando contexto de coach:', err);
      }
    }

    const instructions = DAN_BASE_INSTRUCTIONS + (extraContext ? `\n\n${extraContext}` : '');

    const sessionPayload = {
      type: 'realtime',
      model: process.env.DAN_REALTIME_MODEL || 'gpt-realtime',
      output_modalities: ['text'],
      instructions,
    };

    // Si el modo es voz, habilitás audio input + transcription + VAD
    if (!isTextMode) {
      sessionPayload.audio = {
        input: {
          transcription: { language: 'es', model: 'whisper-1' },

          // ✅ ACÁ va turn_detection (NO en session.turn_detection)
          turn_detection: {
            type: 'server_vad',
            // opcionales (ajustables)
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 200,
            create_response: true,
            interrupt_response: true,
          },
        },
      };
    }

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 600 },
        session: sessionPayload,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Error OpenAI client_secrets:', text);
      return res.status(500).json({ error: 'No se pudo crear el client_secret de Realtime', details: text });
    }

    const clientSecret = await response.json();
    return res.json(clientSecret);
  } catch (err) {
    console.error('Error en getRealtimeClientSecret:', err);
    return res.status(500).json({ error: 'Error interno al generar el client_secret' });
  }
};

/**
 * POST /api/realtime/sessions
 */
export const saveRealtimeSessionSummary = async (req, res) => {
  try {
    const { userId, summary, keyMoments, nextStep, model } = req.body;
    if (!userId || !summary) return res.status(400).json({ message: 'Faltan userId o summary' });

    const sessionDoc = await CoachSession.create({
      owner: userId,
      canal: 'realtime',
      resumen: summary,
      puntosClave: Array.isArray(keyMoments) ? keyMoments : [],
      proximoPaso: nextStep || '',
      modelo: model || process.env.DAN_REALTIME_MODEL || 'gpt-realtime',
    });

    return res.status(201).json({ ok: true, session: sessionDoc });
  } catch (err) {
    console.error('saveRealtimeSessionSummary error:', err);
    return res.status(500).json({ message: 'Error interno guardando resumen' });
  }
};

/**
 * GET /api/realtime/sessions
 */
export const getRealtimeSessions = async (req, res) => {
  try {
    const { userId, format } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '6', 10), 1), 10);
    if (!userId) return res.status(400).json({ message: 'Falta userId' });

    const sessions = await CoachSession.find({ owner: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('createdAt resumen puntosClave proximoPaso')
      .lean();

    if (format === 'tool') {
      const context = sessions
        .map((s, i) => {
          const date = s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : 's/f';
          const resumen = (s.resumen ?? '').toString().slice(0, 220);
          const paso = (s.proximoPaso ?? '').toString().slice(0, 120);
          return `#${i + 1} (${date}) ${resumen}${paso ? ` | Próximo paso: ${paso}` : ''}`;
        })
        .join('\n');
      return res.json({ ok: true, context });
    }

    return res.json({ ok: true, sessions });
  } catch (err) {
    console.error('getRealtimeSessions error:', err);
    return res.status(500).json({ message: 'Error interno obteniendo sesiones' });
  }
};
