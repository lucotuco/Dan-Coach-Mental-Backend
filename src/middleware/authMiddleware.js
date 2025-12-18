// src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';

const DEBUG_AUTH = process.env.DEBUG_AUTH === '1';

const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/users/login' },
  { method: 'POST', path: '/api/users' },

  // Público para que D-ID pueda validar/descargar audio
  { method: 'GET',  prefix: '/api/tts/' },
  { method: 'HEAD', prefix: '/api/tts/' }, // ✅ clave para validación D-ID

  // Health
  { method: 'GET', path: '/health' },
];

function isPublicRoute(req) {
  const requestPath = req.path;

  return PUBLIC_ROUTES.some((route) => {
    if (route.method !== req.method) return false;
    if (route.path) return route.path === requestPath;
    if (route.prefix) return requestPath.startsWith(route.prefix);
    return false;
  });
}

export function authMiddleware(req, res, next) {
  // Extra seguridad: si llega OPTIONS acá, no bloquearlo
  if (req.method === 'OPTIONS') return next();

  const isPublic = isPublicRoute(req);

  if (DEBUG_AUTH) {
    console.log(`[AUTH] ${req.method} ${req.originalUrl} path=${req.path} public=${isPublic}`);
  }

  if (isPublic) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (DEBUG_AUTH) console.warn(`[AUTH] 401 missing bearer: ${req.method} ${req.originalUrl}`);
    return res.status(401).json({ message: 'Token de autorización faltante' });
  }

  const token = authHeader.split(' ')[1];
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!JWT_SECRET) {
    return res.status(500).json({ message: 'Configuración de JWT faltante' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    if (DEBUG_AUTH) console.warn(`[AUTH] 401 invalid jwt: ${req.method} ${req.originalUrl}`);
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}
