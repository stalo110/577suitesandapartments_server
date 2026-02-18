import { Request, Response } from 'express';
import { User, hashPassword } from '../models/UserModel';
import { UserRole } from '../models/UserRoleModel';
import {
  getAllRolesWithPermissions,
  getUserPermissionNames,
  getUserRoleNames,
  resolvePrimaryRoleName,
  setUserPrimaryRole,
} from '../services/rbacService';

const serializeUser = async (user: User) => {
  const roleNames = await getUserRoleNames(user.id);
  const permissions = await getUserPermissionNames(user.id);

  return {
    id: String(user.id),
    email: user.email,
    role: user.role,
    roles: roleNames,
    primaryRole: resolvePrimaryRoleName(roleNames),
    permissions,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

export const getAdminUsers = async (_req: Request, res: Response) => {
  try {
    const users = await User.findAll({
      where: { role: 'ADMIN' },
      order: [['createdAt', 'DESC']],
    });

    const payload = await Promise.all(users.map(serializeUser));
    return res.json(payload);
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching admin users' });
  }
};

export const createAdminUser = async (req: Request, res: Response) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();
    const roleName = String(req.body.roleName || '').trim();

    if (!email || !password || !roleName) {
      return res.status(400).json({ error: 'Email, password, and role are required' });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'User already exists with this email' });
    }

    const user = await User.create({
      email,
      passwordHash: await hashPassword(password),
      role: 'ADMIN',
      isActive: true,
    });

    await setUserPrimaryRole(user.id, roleName);

    return res.status(201).json(await serializeUser(user));
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Error creating admin user' });
  }
};

export const updateAdminUser = async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(String(req.params.id));
    if (!user || user.role !== 'ADMIN') {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    if (req.body.email !== undefined) {
      const nextEmail = String(req.body.email).trim().toLowerCase();
      if (!nextEmail) {
        return res.status(400).json({ error: 'Email cannot be empty' });
      }

      const conflict = await User.findOne({ where: { email: nextEmail } });
      if (conflict && conflict.id !== user.id) {
        return res.status(409).json({ error: 'Another user already uses this email' });
      }

      user.email = nextEmail;
    }

    if (req.body.isActive !== undefined) {
      user.isActive = String(req.body.isActive).toLowerCase() === 'true' || req.body.isActive === true;
    }

    if (req.body.password) {
      const nextPassword = String(req.body.password).trim();
      if (nextPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      user.passwordHash = await hashPassword(nextPassword);
    }

    await user.save();

    if (req.body.roleName !== undefined) {
      const roleName = String(req.body.roleName || '').trim();
      if (!roleName) {
        return res.status(400).json({ error: 'Role is required' });
      }
      await setUserPrimaryRole(user.id, roleName);
    }

    return res.json(await serializeUser(user));
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Error updating admin user' });
  }
};

export const deleteAdminUser = async (req: Request, res: Response) => {
  try {
    const authUser = (req as Request & { user?: { id: string } }).user;
    const userId = Number(req.params.id);

    if (authUser?.id && Number(authUser.id) === userId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const user = await User.findByPk(String(req.params.id));
    if (!user || user.role !== 'ADMIN') {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    await UserRole.destroy({ where: { userId: user.id } });
    await user.destroy();

    return res.json({ message: 'Admin user deleted successfully' });
  } catch (_error) {
    return res.status(500).json({ error: 'Error deleting admin user' });
  }
};

export const getRoles = async (_req: Request, res: Response) => {
  try {
    const roles = await getAllRolesWithPermissions();
    return res.json(roles);
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching roles' });
  }
};
