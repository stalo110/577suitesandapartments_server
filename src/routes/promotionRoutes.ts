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

const registerRoutes = (basePath: string) => {
  router.get(
    `${basePath}/promotions`,
    authenticate,
    authorizePermission('manage_promotions'),
    getPromotions
  );
  router.get(
    `${basePath}/promotions/:id`,
    authenticate,
    authorizePermission('manage_promotions'),
    getPromotionById
  );
  router.post(
    `${basePath}/promotions`,
    authenticate,
    authorizePermission('manage_promotions'),
    createPromotion
  );
  router.put(
    `${basePath}/promotions/:id`,
    authenticate,
    authorizePermission('manage_promotions'),
    updatePromotion
  );
  router.delete(
    `${basePath}/promotions/:id`,
    authenticate,
    authorizePermission('manage_promotions'),
    deletePromotion
  );
};

registerRoutes('/admin');
registerRoutes('/api/admin');

export default router;
