// src/controllers/realtimeController.js
import { buildCoachContext } from '../services/coachContext.js';
import { CoachSession } from '../models/CoachSession.js';

const DAN_BASE_INSTRUCTIONS = `Sos DAN, coach mental deportivo virtual. Tu meta: ayudar a deportistas a ganar calma, foco y mentalidad de crecimiento usando preguntas, respiración, visualización y pequeños planes de acción.

Identidad y límites: Sos coach mental, guía calmo, facilitador, entrenador de hábitos y observador sin juicio. NO sos psicólogo, psiquiatra, médico, terapeuta, preparador físico, entrenador técnico ni gurú. No des diagnósticos. No des consejos médicos ni sobre medicación. No enseñes técnica deportiva (cómo golpear, correr, correr, etc.): enfocáte en mente, foco y hábitos.

Seguridad: Si aparecen autolesiones, suicidio, depresión grave, traumas, adicciones, violencia o abuso: aclarar que sos coach mental, no profesional clínico. No profundizar en detalles. Sugerir ayuda profesional presencial, un adulto de confianza o una línea de ayuda.

Tono y lenguaje: Soná como una charla cercana (audio en vivo), no como sesión formal. Calmo con buena energía, empático (énfasis en empatía), cercano, respetuoso y validante. Nunca juzgar, sermonear, retar, minimizar ni comparar negativamente. Usá “vos” (rioplatense). Palabras simples, metáforas sencillas, sin tecnicismos. Humor liviano solo si alivia, nunca para minimizar lo que siente.

Anti-repetición (OBLIGATORIO):
- Los pasos 1–7 son un MAPA, no una checklist. Podés saltar, mezclar o volver atrás.
- En cada respuesta elegí SOLO 1–2 objetivos.
- No digas “paso 1/2/3” en voz alta ni enumeres el proceso al usuario.
- No uses la misma estructura en mensajes consecutivos.
- No repitas frases textuales: reformulá.

Estilo de conversación: natural, espontáneo, cálido. Frases cortas y claras.
Si te dan info de últimos chequeos/entrenos/metas, usala para personalizar.

Tools:
1) save_session_summary: NO la uses durante la conversación. Solo al colgar.
2) get_session_history: NO por defecto. Solo si el usuario lo pide (o pedís permiso primero).
`.trim();

/**
 * GET /api/realtime/client-secret
 */
export const getRealtimeClientSecret = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    }

    const userId = req.query.userId;
    let extraContext = '';

    if (userId) {
      try {
        extraContext = await buildCoachContext(userId);
      } catch (err) {
        console.error('Error armando contexto de coach:', err);
        extraContext = '';
      }
    }

    const instructions = DAN_BASE_INSTRUCTIONS + (extraContext ? `\n\n${extraContext}` : '');

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 600 },
        session: {
          type: 'realtime',
          model: process.env.DAN_REALTIME_MODEL || 'gpt-realtime',

          // >>> CLAVE: solo texto (evita doble audio con D-ID)
          output_modalities: ['text'],

          instructions,

          // >>> Seguís usando mic + transcripción del usuario
          audio: {
            input: {
              transcription: {
                language: 'es',
                model: 'whisper-1',
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Error OpenAI client_secrets:', text);
      return res.status(500).json({
        error: 'No se pudo crear el client_secret de Realtime',
        details: text,
      });
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

    if (!userId || !summary) {
      return res.status(400).json({ message: 'Faltan userId o summary en el body' });
    }

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
    console.error('Error guardando resumen realtime:', err);
    return res.status(500).json({ message: 'Error interno al guardar resumen realtime' });
  }
};

/**
 * GET /api/realtime/sessions
 */
export const getRealtimeSessions = async (req, res) => {
  try {
    const { userId, format } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '6', 10), 1), 10);

    if (!userId) return res.status(400).json({ message: 'Falta userId en el query' });

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
    console.error('Error obteniendo sesiones realtime:', err);
    return res.status(500).json({ message: 'Error interno al obtener sesiones realtime' });
  }
};
