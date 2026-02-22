import { Router } from 'express';
import {
  createPromotion,
  deletePromotion,
  getPromotionById,
  getPromotions,
  updatePromotion,
} from '../controllers/promotionController';
import { authenticate, authorizePermission } from '../middleware/auth';

const router = Router();

router.get('/admin/promotions', authenticate, authorizePermission('manage_promotions'), getPromotions);
router.get('/api/admin/promotions', authenticate, authorizePermission('manage_promotions'), getPromotions);

router.get('/admin/promotions/:id', authenticate, authorizePermission('manage_promotions'), getPromotionById);
router.get('/api/admin/promotions/:id', authenticate, authorizePermission('manage_promotions'), getPromotionById);

router.post('/admin/promotions', authenticate, authorizePermission('manage_promotions'), createPromotion);
router.post('/api/admin/promotions', authenticate, authorizePermission('manage_promotions'), createPromotion);

router.put('/admin/promotions/:id', authenticate, authorizePermission('manage_promotions'), updatePromotion);
router.put('/api/admin/promotions/:id', authenticate, authorizePermission('manage_promotions'), updatePromotion);

router.delete('/admin/promotions/:id', authenticate, authorizePermission('manage_promotions'), deletePromotion);
router.delete('/api/admin/promotions/:id', authenticate, authorizePermission('manage_promotions'), deletePromotion);

export default router;
