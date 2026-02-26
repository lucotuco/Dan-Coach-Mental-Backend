import bcrypt from'bcryptjs';
import jwt from'jsonwebtoken';
import User from'../models/User.js';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const signToken = (user) => {
  const payload = {
    userId: String(user._id),
    role: user.role,
    teamId: user.teamId ? String(user.teamId) : null,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
};

const publicUser = (user) => ({
  userId: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  teamId: user.teamId ? String(user.teamId) : null,
});

export async function register(req, res) {
  try {
    const name = String(req.body.name || '').trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    // role libre pero validado
    const role = req.body.role === 'coach' ? 'coach' : 'member';

    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashed,
      role,
      teamId: null,
    });

    const token = signToken(user);

    return res.status(201).json({
      token,
      user: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
};

export async function login(req, res) {
  try {

    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);

    return res.json({
      token,
      user: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
};