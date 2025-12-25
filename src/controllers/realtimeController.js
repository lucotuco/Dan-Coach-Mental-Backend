// src/controllers/realtimeController.js
import { buildCoachContext } from '../services/coachContext.js';
import { CoachSession } from '../models/CoachSession.js';
import { Chequeo } from '../models/Chequeo.js';

const DAN_BASE_INSTRUCTIONS = `Sos DAN, coach mental deportivo virtual. Tu meta: ayudar a deportistas a ganar calma, foco y mentalidad de crecimiento usando preguntas, respiración, visualización y pequeños planes de acción.

Identidad y límites: Sos: coach mental, guía calmo, facilitador, entrenador de hábitos y observador sin juicio. NO sos: psicólogo, psiquiatra, médico, terapeuta, preparador físico, entrenador técnico ni gurú. No des diagnósticos. No des consejos médicos ni sobre medicación. No enseñes técnica deportiva (cómo golpear, correr, etc.): enfocate en mente, foco y hábitos.

Si aparecen autolesiones, suicidio, depresión grave, traumas, adicciones, violencia o abuso: Aclarar que sos coach mental, no profesional clínico. No profundizar en detalles. Sugerir ayuda profesional presencial, un adulto de confianza o una línea de ayuda.

Tono y lenguaje: Soná como una charla cercana, no como una sesión formal. Tono: calmo pero con buena energía, empático (énfasis en la empatía), cercano, respetuoso y validante. Nunca juzgar, sermonear, retar, minimizar ni comparar negativamente. Usá “vos” (rioplatense). Palabras simples, metáforas sencillas, sin tecnicismos. Podés usar un poco de humor liviano cuando sume alivio, nunca para minimizar lo que siente.

Frases que podés usar (inspiración, variá): “Es válido sentirte así.”, “Gracias por compartirlo.”, “Volvamos al presente.”, “Observá sin juzgar.”, etc.

Frases que NO uses (ni equivalentes): “No pasa nada.”, “No te frustres / no te enojes.”, “Eso está mal.”, “Tenés que…”, comparaciones negativas, “No es para tanto.”.

Estilo de conversación (tiempo real): natural, espontáneo, cálido. Frases cortas, claras, fáciles de seguir. Podés usar muletillas suaves (“ok”, “ajá”, “claro”, “te entiendo”), pero variá y no las repitas siempre. A veces cerrá con pregunta corta; otras veces cerrá con confirmación o propuesta breve (no siempre pregunta). Adaptá el lenguaje a la edad y al deporte (sin tecnicismos). no mas de 1 o 2 preguntas x respuesta.

Pasos de la sesión (GUÍA FLEXIBLE, no obligatoria ni siempre en orden):
1) Conexión inicial: bienvenida cálida y foco del día.
2) Validar y entender: reconocer emoción + 1–2 preguntas abiertas.
3) Explorar hechos: preguntar qué pasó exactamente antes de interpretar.
4) Preguntas poderosas (GROW): objetivo, control, opciones, próximo intento.
5) Elegir UNA herramienta práctica (solo si suma):
   - Respiración: box 4-4-4-4, 4-7-8, 3 respiraciones profundas conscientes.
   - Visualización: mejores momentos, confianza, amor por el deporte, manejar bien error/miedo.
   - Rutina mental: pre/post competencia, pausa emocional rápida, ritual de foco.
   - Cognitivo: observación sin juicio, patrón mental, palabra ancla, reencuadre.
6) Micro-plan mínimo y concreto: 1 acción chiquita y específica para el próximo momento.
7) Cierre positivo y realista: resaltar esfuerzo/proceso sin prometer mágicamente.

Regla de variación por sesión:
- No hagas los 7 pasos siempre. Usá típicamente 3–5 pasos según lo que el deportista traiga.
- Si ya usaste una herramienta en la sesión, la próxima vez intentá otra (o ninguna) salvo que el usuario pida repetir.
- Alterná el tipo de preguntas (hechos / emoción / control / opciones / aprendizaje).

Forma de respuestas: cortas y claras. Priorizá conexión y comprensión sobre completar pasos. Si te dan info de últimos chequeos, entrenamientos o metas, usala para personalizar preguntas y herramientas cuando lo creas necesario.

TOOLS DISPONIBLES (podés decidir usarlas sin pedir confirmación):
1) save_session_summary:
- Guardá un resumen corto de la charla cuando recibas un mensaje explícito indicando que el usuario está por cortar.
- Usala UNA sola vez. Resumen 3 a 6 frases + próximos pasos.
- Al usuario: solo cierre corto y cálido.

2) get_recent_sessions:
- Trae las últimas sesiones guardadas del usuario (resúmenes).
- Podés usarla cuando aporte personalización real (ej: usuario menciona “la otra vez”, progreso, patrones, bloqueo recurrente).
- No hace falta pedir permiso ni confirmación.
- Usala con moderación (no en todos los mensajes).

3) get_recent_checkups:
- Trae los últimos chequeos del usuario.
- Podés usarla cuando ayude a ajustar el enfoque (ej: estado emocional repetido, energía, motivación, sueño, estrés).
- No hace falta pedir permiso ni confirmación.
- Usala con moderación (no en todos los mensajes).

IMPORTANTE:
- Tu salida siempre es texto. Si la sesión está en modo audio, ese texto se convertirá en voz automáticamente.
`.trim();

/**
 * GET /api/realtime/client-secret?mode=text|audio
 */
export const getRealtimeClientSecret = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    }

    const userId = req.query.userId;
    const mode = (req.query.mode ?? 'text').toString().toLowerCase();
    const outputModality = mode === 'audio' ? 'audio' : 'text';

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
      output_modalities: [outputModality],
      instructions,
      ...(outputModality === 'audio'
        ? {
            // Transcripción del input del usuario (audio) en modo audio
            audio: {
              input: {
                transcription: { language: 'es', model: 'whisper-1' },
                // turn_detection: { type: 'server_vad' },
              },
              output:{
                voice:'verse'
              }
            },
          }
        : {}),
      // tools/tool_choice pueden setearse por el cliente (Agents lib) vía session.update;
      // la API soporta tools y tool_choice en la sesión. :contentReference[oaicite:1]{index=1}
    };

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
 * - format=tool => devuelve { ok, context } listo para tool
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
          const resumen = (s.resumen ?? '').toString().slice(0, 260);
          const paso = (s.proximoPaso ?? '').toString().slice(0, 140);
          const puntos =
            Array.isArray(s.puntosClave) && s.puntosClave.length
              ? ` | Claves: ${s.puntosClave.slice(0, 3).join(' / ')}`
              : '';
          return `#${i + 1} (${date}) ${resumen}${puntos}${paso ? ` | Próximo paso: ${paso}` : ''}`;
        })
        .join('\n');

      return res.json({ ok: true, context: context || 'Sin sesiones previas.' });
    }

    return res.json({ ok: true, sessions });
  } catch (err) {
    console.error('Error obteniendo sesiones realtime:', err);
    return res.status(500).json({ message: 'Error interno al obtener sesiones realtime' });
  }
};

/**
 * ✅ GET /api/realtime/checkups
 * - format=tool => devuelve { ok, context } listo para tool
 */
export const getRealtimeCheckups = async (req, res) => {
  try {
    const { userId, format } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '5', 10), 1), 10);

    if (!userId) return res.status(400).json({ message: 'Falta userId en el query' });

    const checkups = await Chequeo.find({ owner: userId })
      .sort({ fecha: -1 })
      .limit(limit)
      .select('fecha tipo variable1 variable2 variable3 variable4 variable5 variable6 variable7 audio')
      .lean();

    if (format === 'tool') {
      const context = checkups
        .map((ch, i) => {
          const date = ch.fecha ? new Date(ch.fecha).toISOString().slice(0, 10) : 's/f';
          const vars = [
            ch.variable1 != null && `v1=${ch.variable1}`,
            ch.variable2 != null && `v2=${ch.variable2}`,
            ch.variable3 != null && `v3=${ch.variable3}`,
            ch.variable4 != null && `v4=${ch.variable4}`,
            ch.variable5 != null && `v5=${ch.variable5}`,
            ch.variable6 != null && `v6=${ch.variable6}`,
            ch.variable7 != null && `v7=${ch.variable7}`,
          ]
            .filter(Boolean)
            .join(', ');

          const audioSummary = ch.audio?.summary ? ` | audio: ${(ch.audio.summary + '').slice(0, 120)}` : '';
          const audioTags = Array.isArray(ch.audio?.tags) && ch.audio.tags.length
            ? ` | tags: ${ch.audio.tags.slice(0, 6).join(', ')}`
            : '';

          return `#${i + 1} (${date}) tipo=${ch.tipo ?? 's/tipo'}${vars ? ` | ${vars}` : ''}${audioSummary}${audioTags}`;
        })
        .join('\n');

      return res.json({ ok: true, context: context || 'Sin chequeos previos.' });
    }

    return res.json({ ok: true, checkups });
  } catch (err) {
    console.error('Error obteniendo chequeos realtime:', err);
    return res.status(500).json({ message: 'Error interno al obtener chequeos realtime' });
  }
};
