// src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';

const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/auth/register' },
  { method: 'GET', path: '/api/auth/login' },
  { method: 'POST', path: '/api/users' },

  { method: 'GET', prefix: '/api/tts/' },
  { method: 'HEAD', prefix: '/api/tts/' },

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

  if (!JWT_SECRET) return res.status(500).json({ message: 'Configuración de JWT faltante' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('[AUTH] decoded JWT payload:', decoded);
    req.user = {
    userId: decoded.userId,
    role: decoded.role,     
    teamId: decoded.teamId, 
};
    return next();
  } catch {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}
