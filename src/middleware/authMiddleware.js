// src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';

const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/users/login' },
  { method: 'POST', path: '/api/users' },

  // Público para que D-ID pueda VALIDAR y BAJAR el mp3
  // Importante: D-ID suele hacer HEAD antes de GET
  { method: 'GET', prefix: '/api/tts/' },
  { method: 'HEAD', prefix: '/api/tts/' },

  // opcional
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
  if (isPublicRoute(req)) return next();

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}
