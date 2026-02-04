import { Router } from 'express';
import {
  initializePayment,
  verifyPayment,
  getAdminPayments,
  downloadReceipt,
} from '../controllers/paymentsController';

const router = Router();

router.post('/payments/initialize', initializePayment);
router.post('/payments/verify', verifyPayment);
router.get('/admin/payments', getAdminPayments);
router.get('/payments/:paymentId/receipt/:format', downloadReceipt);

export default router;
