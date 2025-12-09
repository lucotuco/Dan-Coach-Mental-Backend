import jwt from 'jsonwebtoken';

const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/users/login' },
];

function isPublicRoute(req) {
  const requestPath = req.path;
  return PUBLIC_ROUTES.some(
    (route) => route.method === req.method && route.path === requestPath,
  );
}

export function authMiddleware(req, res, next) {
  if (isPublicRoute(req)) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token de autorización faltante' });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return res.status(500).json({ message: 'Configuración de JWT faltante' });
  }

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}
