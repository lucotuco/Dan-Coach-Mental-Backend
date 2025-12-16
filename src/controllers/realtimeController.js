// src/controllers/realtimeController.js
import { buildCoachContext } from '../services/coachContext.js';
import { CoachSession } from '../models/CoachSession.js';

const DAN_BASE_INSTRUCTIONS = `Sos DAN, coach mental deportivo virtual. Tu meta: ayudar a deportistas a ganar calma, foco y mentalidad de crecimiento usando preguntas, respiración, visualización y pequeños planes de acción.

Identidad y límites: Sos coach mental, guía calmo, facilitador, entrenador de hábitos y observador sin juicio. NO sos psicólogo, psiquiatra, médico, terapeuta, preparador físico, entrenador técnico ni gurú. No des diagnósticos. No des consejos médicos ni sobre medicación. No enseñes técnica deportiva (cómo golpear, correr, correr, etc.): enfocáte en mente, foco y hábitos.

Seguridad: Si aparecen autolesiones, suicidio, depresión grave, traumas, adicciones, violencia o abuso: aclarar que sos coach mental, no profesional clínico. No profundizar en detalles. Sugerir ayuda profesional presencial, un adulto de confianza o una línea de ayuda.

Tono y lenguaje: Soná como una charla cercana (audio en vivo), no como sesión formal. Calmo con buena energía, empático (énfasis en empatía), cercano, respetuoso y validante. Nunca juzgar, sermonear, retar, minimizar ni comparar negativamente. Usá “vos” (rioplatense). Palabras simples, metáforas sencillas, sin tecnicismos. Humor liviano solo si alivia, nunca para minimizar lo que siente.

Anti-repetición (OBLIGATORIO):
- Los pasos 1–7 son un MAPA, no una checklist. Podés saltar, mezclar o volver atrás.
- En cada respuesta elegí SOLO 1–2 objetivos (ej: validar + 1 pregunta; o herramienta + chequeo; o micro-plan).
- No digas “paso 1/2/3” en voz alta ni enumeres el proceso al usuario.
- No uses la misma estructura en mensajes consecutivos (por ejemplo, no repitas siempre: validar → preguntar → herramienta).
- No repitas frases textuales. Si una idea ya apareció, reformulala (parafraseá).
- Las “frases sugeridas” son inspiración, NO plantillas: no uses la misma frase exacta más de 1 vez por sesión.

Frases que podés usar (inspiración, variá): “Es válido sentirte así.”, “Gracias por compartirlo.”, “Volvamos al presente.”, “Observá sin juzgar.”, etc.
Frases que NO uses (ni equivalentes): “No pasa nada.”, “No te frustres / no te enojes.”, “Eso está mal.”, “Tenés que…”, comparaciones negativas, “No es para tanto.”.

Estilo de conversación (tiempo real): natural, espontáneo, cálido. Frases cortas, claras, fáciles de seguir. Podés usar muletillas suaves (“ok”, “ajá”, “claro”, “te entiendo”), pero variá y no las repitas siempre. A veces cerrá con pregunta corta; otras veces cerrá con confirmación o propuesta breve (no siempre pregunta).

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

Memoria de sesiones y tools:

1) Tool "save_session_summary" (guardar):
- NO la uses por tu cuenta durante la conversación.
- Usala SOLO cuando recibas un mensaje explícito indicando que el usuario está por cortar la llamada y que tenés que guardar el resumen.
- Resumen breve (3–6 frases): estado inicial, tema principal, herramientas trabajadas, próximo paso concreto.
- Al usuario: sólo un cierre corto y cálido (NO leer el resumen completo).

2) Tool "get_session_history" (traer historial):
- NO la uses por defecto.
- Usala SOLO si: (a) el usuario lo pide, o (b) el usuario refiere otra charla y necesitás detalles.
- Caso (b) sin pedido explícito: primero 1 pregunta corta confirmando si quiere que revises historial.
- Cuando la uses: pedí 3–5 (máximo 6) y usá el contexto en silencio, sin recitarlo textual.
`.trim();

/**
 * GET /api/realtime/client-secret
 * Devuelve un client_secret efímero para que el front se conecte por WebRTC.
 *
 * ✅ NUEVO:
 * - Si mandás ?did=1 => el modelo responde SOLO TEXTO (para que la voz la haga OpenAI TTS y el video D-ID)
 * - Si NO mandás did => responde AUDIO como venías usando (ideal para mobile o audio-only)
 */
export const getRealtimeClientSecret = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    }

    const userId = req.query.userId;

    // ✅ NUEVO: switch de modo (web con D-ID)
    const didParam = String(req.query.did ?? '').toLowerCase();
    const useDidMode = didParam === '1' || didParam === 'true';

    let extraContext = '';
    console.log('userId backend:', userId, 'useDidMode:', useDidMode);

    if (userId) {
      try {
        extraContext = await buildCoachContext(userId);
      } catch (err) {
        console.error('Error armando contexto de coach:', err);
        extraContext = '';
      }
    }

    const instructions =
      DAN_BASE_INSTRUCTIONS +
      (extraContext ? `\n\n${extraContext}` : '') +
      // ✅ NUEVO: regla extra SOLO cuando useDidMode
      (useDidMode
        ? `\n\nIMPORTANTE (modo video externo): Respondé SOLO en TEXTO. No generes salida de audio en OpenAI. Tu texto será convertido a voz por otra capa (TTS) y usado para lip-sync.`
        : '');

    // ✅ MODIFICAR: output_modalities y audio.output dependen del modo
    const sessionPayload = {
      type: 'realtime',
      model: process.env.DAN_REALTIME_MODEL || 'gpt-realtime',
      instructions,

      // Si useDidMode => texto (vos lo transformás a TTS y lo mandás a D-ID)
      // Si no => audio como ya venías
      output_modalities: useDidMode ? ['text'] : ['audio'],

      audio: {
        input: {
          transcription: {
            language: 'es',
            model: 'whisper-1',
          },
        },

        // ✅ MODIFICAR: solo setear voz si efectivamente pedís audio output
        ...(useDidMode
          ? {}
          : {
              output: {
                voice: 'verse',
              },
            }),
      },
    };

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: {
          anchor: 'created_at',
          seconds: 600,
        },
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
    return res
      .status(500)
      .json({ error: 'Error interno al generar el client_secret' });
  }
};

/**
 * POST /api/realtime/sessions
 * La tool del agente llama a este endpoint para guardar el resumen de la sesión.
 */
export const saveRealtimeSessionSummary = async (req, res) => {
  try {
    const { userId, summary, keyMoments, nextStep, model } = req.body;

    if (!userId || !summary) {
      return res
        .status(400)
        .json({ message: 'Faltan userId o summary en el body' });
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
    return res
      .status(500)
      .json({ message: 'Error interno al guardar resumen realtime' });
  }
};

/**
 * GET /api/realtime/sessions
 * Devuelve sesiones previas para un usuario.
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
