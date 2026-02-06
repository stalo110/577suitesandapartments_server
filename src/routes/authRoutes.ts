import { Router } from 'express';
import {
  adminLogin,
  changeAdminPassword,
  confirmAdminPasswordReset,
  guestLogin,
  guestRegister,
  requestAdminPasswordReset,
} from '../controllers/authController';
import { authenticate, authorizeRoles } from '../middleware/auth';

const router = Router();

router.post('/auth/admin/login', adminLogin);
router.post('/auth/admin/reset', requestAdminPasswordReset);
router.post('/auth/admin/reset/confirm', confirmAdminPasswordReset);
router.post('/auth/admin/change-password', authenticate, authorizeRoles('ADMIN'), changeAdminPassword);
router.post('/auth/login', guestLogin);
router.post('/auth/register', guestRegister);

export default router;
