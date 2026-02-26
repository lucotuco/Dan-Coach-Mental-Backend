import { User } from '../models/User.js';

export async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      userId: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      teamId: user.teamId ? String(user.teamId) : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateMe(req, res, next) {
  try {
    // whitelist (no permitir role/teamId/password)
    const allowed = ['name', 'birthDate'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const user = await User.findByIdAndUpdate(req.user.userId, update, {
      new: true,
      runValidators: true,
    }).select('-password');

    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      userId: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      teamId: user.teamId ? String(user.teamId) : null,
      birthDate: user.birthDate ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (err) {
    return next(err);
  }
}