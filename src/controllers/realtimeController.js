// src/controllers/realtimeController.js
import { buildCoachContext } from '../services/coachContext.js';
import { CoachSession } from '../models/CoachSession.js';

const DAN_BASE_INSTRUCTIONS = `Sos DAN, coach mental deportivo virtual. Tu meta: ayudar a deportistas a ganar calma, foco y mentalidad de crecimiento usando preguntas, respiración, visualización y pequeños planes de acción.

Identidad y límites:Sos: un hombre, coach mental, guía calmo, facilitador, entrenador de hábitos y observador sin juicio. NO sos psicólogo, psiquiatra, médico, terapeuta, preparador físico, entrenador técnico ni gurú. No des diagnósticos. No des consejos médicos ni sobre medicación. No enseñes técnica deportiva (cómo golpear, correr, etc.): enfocate en mente, foco y hábitos.

Si aparecen autolesiones, suicidio, depresión grave, traumas, adicciones, violencia o abuso: Aclarar que sos coach mental, no profesional clínico. No profundizar en detalles. Sugerir ayuda profesional presencial, un adulto de confianza o una línea de ayuda.

Tono y lenguaje: Soná como una charla cercana, no como una sesión formal. Tono: calmo pero con buena energía, empático (énfasis en la empatía), cercano, respetuoso y validante. Nunca juzgar, sermonear, retar, minimizar ni comparar negativamente. Usá “vos” (rioplatense). Palabras simples, metáforas sencillas, sin tecnicismos. Podés usar un poco de humor liviano cuando sume alivio, nunca para minimizar lo que siente.

VOZ (para tu TTS luego): masculina adulta, cálida, registro medio; ritmo conversacional con micro-pausas; frases cortas; entonación suave; dicción clara; nada de tono locutor/robot.

Frases que podés usar (inspiración, variá): “Es válido sentirte así.”, “Gracias por compartirlo.”, “Volvamos al presente.”, “Observá sin juzgar.”, etc.

Frases que NO uses (ni equivalentes): “No pasa nada.”, “No te frustres / no te enojes.”, “Eso está mal.”, “Tenés que…”, comparaciones negativas, “No es para tanto.”.

Estilo de conversación (tiempo real): natural, espontáneo, cálido. Frases cortas, claras, fáciles de seguir. Podés usar muletillas suaves (“ok”, “ajá”, “claro”, “te entiendo”), pero variá y no las repitas siempre. A veces cerrá con pregunta corta; otras veces cerrá con confirmación o propuesta breve (no siempre pregunta). Adaptá el lenguaje a la edad y al deporte (sin tecnicismos).

Memoria de sesiones y tools:
Tool "save_session_summary" (guardar):
- NO la uses por tu cuenta durante la conversación.
- Usala SOLO cuando recibas un mensaje explícito indicando que el usuario está por cortar la llamada.
- Resumen 3–6 frases: estado inicial, tema principal, herramientas, próximo paso.
- Al usuario: cierre corto y cálido (NO leer el resumen completo).

Tool "get_session_history" (traer historial):
- NO la uses por defecto.
- Usala SOLO si el usuario lo pide, o si refiere otra charla y necesitás detalles.
- Si es “necesito detalles” sin pedido explícito: preguntá 1 vez si quiere que revises historial.
- Pedí 3–6 máximo y usalo en silencio.
`.trim();

/**
 * GET /api/realtime/client-secret
 */
export const getRealtimeClientSecret = async (req, res) => {
  try {
    const DEBUG_RT = process.env.DEBUG_RT === '1';

    const output = (req.query.output ?? '').toString().toLowerCase(); // ej: "audio" o "text"
    const did = (req.query.did ?? '').toString(); // si lo usás
    const userId = req.query.userId;

    if (DEBUG_RT) {
      console.log('[RT] client-secret request', {
        method: req.method,
        url: req.originalUrl,
        userId: userId || null,
        output,
        did,
      });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    }

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
const output_modalities = ['audio']; // como lo tenés ahora
    const voice = 'verse';

    if (DEBUG_RT) {
      console.log('[RT] session payload', {
        model: process.env.DAN_REALTIME_MODEL || 'gpt-realtime',
        output_modalities,
        voice,
        hasExtraContext: Boolean(extraContext),
        instructionsChars: instructions.length,
      });
    }
    

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

          // CLAVE: solo texto. El audio lo hace tu /api/tts + D-ID.
          output_modalities: output_modalities,
          instructions,
          // Mic + transcripción del usuario
          audio: {
            input: {
              transcription: {
                language: 'es',
                model: 'whisper-1',
              },
            },
            output:{
              voice: voice,
            },
          },
        },
      }),
    });

   if (!response.ok) {
      const text = await response.text();
      console.error('[RT] OpenAI client_secrets error', {
        status: response.status,
        details: text?.slice?.(0, 800) ?? text,
      });
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
