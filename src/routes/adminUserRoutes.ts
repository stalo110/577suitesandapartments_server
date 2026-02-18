import { Router } from 'express';
import {
  createAdminUser,
  deleteAdminUser,
  getAdminUsers,
  getRoles,
  updateAdminUser,
} from '../controllers/adminUserController';
import { authenticate, authorizePermission } from '../middleware/auth';

const router = Router();

const registerRoutes = (basePath: string) => {
  router.get(
    `${basePath}/users`,
    authenticate,
    authorizePermission('manage_users'),
    getAdminUsers
  );
  router.post(
    `${basePath}/users`,
    authenticate,
    authorizePermission('manage_users'),
    createAdminUser
  );
  router.put(
    `${basePath}/users/:id`,
    authenticate,
    authorizePermission('manage_users'),
    updateAdminUser
  );
  router.delete(
    `${basePath}/users/:id`,
    authenticate,
    authorizePermission('manage_users'),
    deleteAdminUser
  );

  router.get(
    `${basePath}/roles`,
    authenticate,
    authorizePermission('manage_users'),
    getRoles
  );
};

registerRoutes('/admin');
registerRoutes('/api/admin');

export default router;
