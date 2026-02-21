import { Router } from 'express';
import { authenticate, authorizePermission } from '../middleware/auth';
import {
  getContactMessages,
  replyToContactMessage,
  updateContactMessageStatus,
} from '../controllers/contactController';

const router = Router();

router.get('/admin/messages', authenticate, authorizePermission('manage_messages'), getContactMessages);
router.patch(
  '/admin/messages/:id/status',
  authenticate,
  authorizePermission('manage_messages'),
  updateContactMessageStatus
);
router.post(
  '/admin/messages/:id/reply',
  authenticate,
  authorizePermission('manage_messages'),
  replyToContactMessage
);

export default router;
