import crypto from 'crypto';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { User, verifyPassword, hashPassword } from '../models/UserModel';
import { sendAdminPasswordResetEmail } from '../utils/mailer';

dotenv.config();

const jwtsecret = process.env.JWT_SECRET || 'dev-secret';

const signToken = (payload: Record<string, unknown>) => jwt.sign(payload, jwtsecret, { expiresIn: '7d' });

const buildResponse = (user: User) => ({
  token: signToken({ id: user.id, email: user.email, role: user.role }),
  user: {
    id: String(user.id),
    email: user.email,
    role: user.role,
  },
});

const validateCredentials = async (email: string, password: string, role: 'ADMIN' | 'GUEST') => {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const user = await User.findOne({ where: { email, role } });
  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  return buildResponse(user);
};

export const adminLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const response = await validateCredentials(email, password, 'ADMIN');
    return res.json(response);
  } catch (_error) {
    return res.status(400).json({ message: 'Invalid email or password' });
  }
};

export const guestLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const response = await validateCredentials(email, password, 'GUEST');
    return res.json(response);
  } catch (_error) {
    return res.status(400).json({ message: 'Invalid email or password' });
  }
};

export const guestRegister = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const existing = await User.findOne({ where: { email, role: 'GUEST' } });
  if (existing) {
    return res.status(409).json({ message: 'Guest already registered' });
  }

  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
    role: 'GUEST',
  });

  return res.status(201).json(buildResponse(user));
};

export const requestAdminPasswordReset = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const user = await User.findOne({ where: { email, role: 'ADMIN' } });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await user.update({
        resetTokenHash: tokenHash,
        resetTokenExpiresAt: expiresAt,
      });

      const baseUrl = process.env.PUBLIC_CLIENT_URL || 'http://localhost:3039';
      const resetUrl = `${baseUrl}/admin/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
      await sendAdminPasswordResetEmail(email, resetUrl);
    }

    return res.json({ message: 'If the account exists, a reset link has been sent' });
  } catch (_error) {
    return res.status(500).json({ message: 'Unable to process reset request' });
  }
};

export const confirmAdminPasswordReset = async (req: Request, res: Response) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) {
    return res.status(400).json({ message: 'Email, token, and new password are required' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      where: {
        email,
        role: 'ADMIN',
        resetTokenHash: tokenHash,
      },
    });

    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      return res.status(400).json({ message: 'Reset token is invalid or expired' });
    }

    user.passwordHash = await hashPassword(newPassword);
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    await user.save();

    return res.json({ message: 'Password reset successfully' });
  } catch (_error) {
    return res.status(500).json({ message: 'Unable to reset password' });
  }
};

export const changeAdminPassword = async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new passwords are required' });
  }

  try {
    const user = await User.findByPk(userId);
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.passwordHash = await hashPassword(newPassword);
    await user.save();

    return res.json({ message: 'Password updated successfully' });
  } catch (_error) {
    return res.status(500).json({ message: 'Unable to update password' });
  }
};
