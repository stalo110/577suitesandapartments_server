import { Router } from 'express';
import { authenticate, authorizePermission } from '../middleware/auth';
import { getContactMessages } from '../controllers/contactController';

const router = Router();

router.get('/admin/messages', authenticate, authorizePermission('manage_messages'), getContactMessages);

export default router;
