import { Router } from 'express';
import {
  initializePayment,
  verifyPayment,
  verifyPaymentRedirect,
  getPaymentConfig,
  getAdminPayments,
  getTransactionByReference,
  downloadReceipt,
} from '../controllers/paymentsController';
import { authenticate, authorizePermission } from '../middleware/auth';

const router = Router();

router.post('/payments/initialize', initializePayment);
router.post('/payments/verify', verifyPayment);
router.get('/verify-payment', verifyPaymentRedirect);
router.get('/payments/config', getPaymentConfig);
router.get('/admin/payments', authenticate, authorizePermission('view_finance'), getAdminPayments);
router.get(
  '/admin/transactions/:reference',
  authenticate,
  authorizePermission('view_finance'),
  getTransactionByReference
);
router.get('/payments/:paymentId/receipt/:format', downloadReceipt);

export default router;
