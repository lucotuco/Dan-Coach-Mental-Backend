// src/services/coachContext.js
import { User } from '../models/User.js';
import { Chequeo } from '../models/Chequeo.js';
import { CoachSession } from '../models/CoachSession.js';

export async function buildCoachContext(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error('Usuario no encontrado');

  // Últimos 5 chequeos
  const chequeos = await Chequeo.find({ owner: userId })
    .sort({ fecha: -1 })
    .limit(5)
    .lean();

  // Última sesión en vivo (realtime)
  const ultimaSesion = await CoachSession.findOne({
    owner: userId,
    canal: 'realtime',
  })
    .sort({ fecha: -1 })
    .lean();

  //
  // ---------- CONTEXTO DEL USUARIO ----------
  //
  const userContextParts = [];

  userContextParts.push(`Nombre: ${user.name ?? 'Sin nombre'}`);

  if (user.deporte || user.sport) {
    userContextParts.push(`Deporte: ${user.deporte || user.sport}`);
  }
  if (user.posicion) {
    userContextParts.push(`Posición: ${user.posicion}`);
  }
  if (user.edad) {
    userContextParts.push(`Edad: ${user.edad}`);
  }
  if (user.nivel || user.level) {
    userContextParts.push(`Nivel: ${user.nivel || user.level}`);
  }

  // Meta por TEXTO
  if (user.goalT) {
    userContextParts.push(`Meta: ${user.goalT}`);
  }
  // Sino, si hay meta por AUDIO
  else if (user.goalA) {
    const summary = user.goalA.summary ?? '(sin resumen)';
    const tagsArray = Array.isArray(user.goalA.tags) ? user.goalA.tags : [];
    const tagsText =
      tagsArray.length > 0 ? tagsArray.join(', ') : '(sin tags)';

    userContextParts.push(
      `Meta resumen: ${summary} - tags: ${tagsText}`,
    );
  }

  const userContext = userContextParts.filter(Boolean).join('\n');

  //
  // ---------- CONTEXTO DE CHEQUEOS ----------
  //
  const chequeosContext = chequeos
    .map((ch) => {
      const fecha = ch.fecha
        ? new Date(ch.fecha).toISOString().split('T')[0]
        : 'sin fecha';

      const vars = [
        ch.variable1 && `v1=${ch.variable1}`,
        ch.variable2 && `v2=${ch.variable2}`,
        ch.variable3 && `v3=${ch.variable3}`,
        ch.variable4 && `v4=${ch.variable4}`,
        ch.variable5 && `v5=${ch.variable5}`,
        ch.variable6 && `v6=${ch.variable6}`,
        ch.variable7 && `v7=${ch.variable7}`,
      ]
        .filter(Boolean)
        .join(', ');

      const audioSummary = ch.audio?.summary;
      const audioTags = Array.isArray(ch.audio?.tags)
        ? ch.audio.tags.join(', ')
        : undefined;

      let extraPart = '';
      if (audioSummary || audioTags) {
        extraPart += ` | audio resumen: ${audioSummary ?? '(sin resumen)'}`;
        if (audioTags) {
          extraPart += ` | audio tags: ${audioTags}`;
        }
      }

      return `- ${fecha} | tipo: ${ch.tipo}${
        vars ? ` | ${vars}` : ''
      }${extraPart}`;
    })
    .join('\n');

  //
  // ---------- CONTEXTO DE ÚLTIMA SESIÓN EN VIVO ----------
  //
  let sesionesContext = 'Sin sesiones en vivo registradas aún';

  if (ultimaSesion) {
    const fechaSesion = ultimaSesion.fecha
      ? new Date(ultimaSesion.fecha).toISOString().split('T')[0]
      : 'sin fecha';

    const puntos =
      Array.isArray(ultimaSesion.puntosClave) &&
      ultimaSesion.puntosClave.length > 0
        ? '\n  - ' + ultimaSesion.puntosClave.join('\n  - ')
        : '';

    const proximo = ultimaSesion.proximoPaso
      ? `\nPróximo paso acordado: ${ultimaSesion.proximoPaso}`
      : '';

    sesionesContext = `Última sesión en vivo (${fechaSesion}): ${
      ultimaSesion.resumen || '(sin resumen)'
    }${puntos}${proximo}`;
  }

  //
  // ---------- STRING FINAL ----------
  //
  const contextString = `
[CONTEXTO DEL USUARIO]
${userContext || 'Sin datos de usuario'}

[ULTIMOS CHEQUEOS]
${chequeosContext || 'Sin chequeos registrados aún'}

[SESIONES EN VIVO]
${sesionesContext}
`.trim();

  return contextString;
}
