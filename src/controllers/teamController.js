import mongoose from 'mongoose';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';

function normalizeJoinCode(code) {
  return String(code || '').trim().toUpperCase();
}

function toId(id) {
  return new mongoose.Types.ObjectId(id);
}

export async function createTeam(req, res, next) {
  try {
    const name = String(req.body.name || '').trim();
    const type = String(req.body.type || 'other').trim();
    const joinCode = normalizeJoinCode(req.body.joinCode);

    if (!name) return res.status(400).json({ error: 'Team name required' });
    if (!joinCode) return res.status(400).json({ error: 'joinCode required' });
    if (joinCode.length < 4 || joinCode.length > 16) {
      return res.status(400).json({ error: 'joinCode must be 4-16 chars' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.teamId) return res.status(409).json({ error: 'User already has a team' });

    // Evitar joinCodes repetidos
    const exists = await Team.exists({ joinCode });
    if (exists) return res.status(409).json({ error: 'joinCode already in use' });

    const team = await Team.create({
      name,
      type,
      joinCode,
      ownerUserId: user._id,
    });

    user.teamId = team._id;
    user.role = 'coach';
    await user.save();

    return res.status(201).json({
      team: {
        teamId: String(team._id),
        name: team.name,
        type: team.type,
        joinCode: team.joinCode,
        ownerUserId: String(team.ownerUserId),
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function getMyTeam(req, res, next) {
  try {
    if (!req.user.teamId) return res.json({ team: null });

    const team = await Team.findById(req.user.teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    return res.json({
      team: {
        teamId: String(team._id),
        name: team.name,
        type: team.type,
        joinCode: team.joinCode,
        ownerUserId: String(team.ownerUserId),
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateMyTeam(req, res, next) {
  try {
    if (!req.user.teamId) return res.status(400).json({ error: 'User has no team' });

    const team = await Team.findById(req.user.teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Recomendado: solo owner puede editar
    if (String(team.ownerUserId) !== String(req.user.userId)) {
      return res.status(403).json({ error: 'Only team owner can update team' });
    }

    const update = {};

    if (req.body.name !== undefined) {
      update.name = String(req.body.name).trim();
      if (!update.name) return res.status(400).json({ error: 'Team name cannot be empty' });
    }

    if (req.body.type !== undefined) {
      update.type = String(req.body.type).trim();
    }

    if (req.body.joinCode !== undefined) {
      const joinCode = normalizeJoinCode(req.body.joinCode);
      if (!joinCode) return res.status(400).json({ error: 'joinCode cannot be empty' });
      if (joinCode.length < 4 || joinCode.length > 16) {
        return res.status(400).json({ error: 'joinCode must be 4-16 chars' });
      }

      const exists = await Team.exists({ joinCode, _id: { $ne: team._id } });
      if (exists) return res.status(409).json({ error: 'joinCode already in use' });

      update.joinCode = joinCode;
    }

    const updated = await Team.findByIdAndUpdate(team._id, update, {
      new: true,
      runValidators: true,
    });

    return res.json({
      team: {
        teamId: String(updated._id),
        name: updated.name,
        type: updated.type,
        joinCode: updated.joinCode,
        ownerUserId: String(updated.ownerUserId),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function listMembers(req, res, next) {
  try {
    const members = await User.find({ teamId: req.user.teamId })
      .select('_id name email role createdAt');

    return res.json({
      members: members.map((m) => ({
        userId: String(m._id),
        name: m.name,
        email: m.email,
        role: m.role,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

export async function addMemberByEmail(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email required' });

    const member = await User.findOne({ email });
    if (!member) return res.status(404).json({ error: 'User not found' });

    if (member.teamId) return res.status(409).json({ error: 'User already in a team' });

    member.teamId = toId(req.user.teamId);
    member.role = 'member';
    await member.save();

    return res.json({ ok: true, memberId: String(member._id) });
  } catch (err) {
    return next(err);
  }
}

export async function removeMember(req, res, next) {
  try {
    const memberUserId = req.params.memberUserId;

    if (!mongoose.Types.ObjectId.isValid(memberUserId)) {
      return res.status(400).json({ error: 'Invalid member id' });
    }

    if (String(memberUserId) === String(req.user.userId)) {
      return res.status(400).json({ error: 'Coach cannot remove self' });
    }

    const team = await Team.findById(req.user.teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    if (String(team.ownerUserId) !== String(req.user.userId)) {
      return res.status(403).json({ error: 'Only team owner can remove members' });
    }

    const member = await User.findOne({ _id: memberUserId, teamId: req.user.teamId });
    if (!member) return res.status(404).json({ error: 'Member not found in your team' });

    member.teamId = null;
    member.role = 'member';
    await member.save();

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

export async function joinByCode(req, res, next) {
  try {
    const joinCode = normalizeJoinCode(req.body.joinCode);
    if (!joinCode) return res.status(400).json({ error: 'joinCode required' });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.teamId) return res.status(409).json({ error: 'User already in a team' });

    const team = await Team.findOne({ joinCode });
    if (!team) return res.status(404).json({ error: 'Invalid join code' });

    user.teamId = team._id;
    user.role = 'member';
    await user.save();

    return res.json({
      ok: true,
      team: {
        teamId: String(team._id),
        name: team.name,
        type: team.type,
        ownerUserId: String(team.ownerUserId),
      },
    });
  } catch (err) {
    return next(err);
  }
}