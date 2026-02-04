import { Router } from 'express';
import { adminLogin, guestLogin, guestRegister } from '../controllers/authController';

const router = Router();

router.post('/auth/admin/login', adminLogin);
router.post('/auth/login', guestLogin);
router.post('/auth/register', guestRegister);

export default router;
