import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { getContactMessages } from '../controllers/contactController';

const router = Router();

router.get('/admin/messages', authenticate, authorizeRoles('ADMIN'), getContactMessages);

export default router;
