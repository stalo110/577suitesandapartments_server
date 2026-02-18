import { Router } from 'express';
import { uploadImages } from '../helpers/uploadImage';
import { createSuite, updateSuite, deleteSuite } from '../controllers/suitesController';
import { authenticate, authorizePermission } from '../middleware/auth';

const router = Router();
router.post(
  '/admin/suites',
  authenticate,
  authorizePermission('manage_suites'),
  uploadImages.array('images', 6),
  createSuite
);
router.put(
  '/admin/suites/:id',
  authenticate,
  authorizePermission('manage_suites'),
  uploadImages.array('images', 6),
  updateSuite
);
router.delete(
  '/admin/suites/:id',
  authenticate,
  authorizePermission('manage_suites'),
  deleteSuite
);

export default router;
