// src/middleware/requireAuth.js
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Token de autorización faltante' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: 'JWT_SECRET no configurado' });
    }

    const payload = jwt.verify(token, secret);
    // Ajustá según cómo firmes el JWT en tu app:
    req.userId = payload.userId || payload.id || payload.sub;
    req.user = payload;

    if (!req.userId) {
      return res.status(401).json({ message: 'Token inválido (sin userId)' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}
