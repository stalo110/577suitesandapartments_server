import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '../models/UserModel';

export interface AuthPayload {
  id: string;
  email: string;
  role: UserRole;
}

type AuthenticatedRequest = Request & { user?: AuthPayload };

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET is required in production');
}

const getTokenFromHeader = (req: Request) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return '';
};

export const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = getTokenFromHeader(req);
  if (!token || !jwtSecret) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as AuthPayload;
    req.user = {
      id: String(decoded.id),
      email: decoded.email,
      role: decoded.role,
    };
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const authorizeRoles = (...roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    return next();
  };
};
