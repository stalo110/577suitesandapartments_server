import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { User, verifyPassword, hashPassword } from '../models/UserModel';

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
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const existing = await User.findOne({ where: { email, role: 'GUEST' } });
  if (existing) {
    return res.status(409).json({ message: 'Guest already registered' });
  }

  const guestPassword = password || process.env.DEMO_GUEST_PASSWORD || 'Guest@517VIP';
  const user = await User.create({
    email,
    passwordHash: await hashPassword(guestPassword),
    role: 'GUEST',
  });

  return res.status(201).json(buildResponse(user));
};
