import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '../models/UserModel';
import { getUserPermissionNames } from '../services/rbacService';

export interface AuthPayload {
  id: string;
  email: string;
  role: UserRole;
  roles?: string[];
  permissions?: string[];
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
      roles: Array.isArray(decoded.roles) ? decoded.roles : [],
      permissions: Array.isArray(decoded.permissions) ? decoded.permissions : [],
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

export const authorizePermission = (...requiredPermissions: string[]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!requiredPermissions.length) {
      return next();
    }

    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const tokenPermissions = req.user.permissions || [];
    if (tokenPermissions.includes('all_access')) {
      return next();
    }

    if (requiredPermissions.some((permission) => tokenPermissions.includes(permission))) {
      return next();
    }

    const userId = Number(req.user.id);
    if (!Number.isNaN(userId)) {
      const refreshedPermissions = await getUserPermissionNames(userId);
      if (
        refreshedPermissions.includes('all_access') ||
        requiredPermissions.some((permission) => refreshedPermissions.includes(permission))
      ) {
        return next();
      }
    }

    return res.status(403).json({ message: 'Unauthorized' });
  };
};
