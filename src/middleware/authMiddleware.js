// src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';

const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/users/login' },
  { method: 'POST', path: '/api/users' },

  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/' },
  { method: 'HEAD', path: '/' },

  // TTS para D-ID
  { method: 'GET', prefix: '/api/tts/' },
  { method: 'HEAD', prefix: '/api/tts/' },

  // (Opcional) proxy idle video
  { method: 'GET', prefix: '/api/did/idle-video' },
  { method: 'HEAD', prefix: '/api/did/idle-video' },
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
  if (isPublicRoute(req)) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token de autorización faltante' });
  }

  const token = authHeader.split(' ')[1];
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!JWT_SECRET) return res.status(500).json({ message: 'Configuración de JWT faltante' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}
