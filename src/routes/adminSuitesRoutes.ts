import { Router } from 'express';
import { uploadImages } from '../helpers/uploadImage';
import { createSuite, updateSuite, deleteSuite } from '../controllers/suitesController';
import { authenticate, authorizeRoles } from '../middleware/auth';

const router = Router();
router.post(
  '/admin/suites',
  authenticate,
  authorizeRoles('ADMIN'),
  uploadImages.array('images', 6),
  createSuite
);
router.put(
  '/admin/suites/:id',
  authenticate,
  authorizeRoles('ADMIN'),
  uploadImages.array('images', 6),
  updateSuite
);
router.delete(
  '/admin/suites/:id',
  authenticate,
  authorizeRoles('ADMIN'),
  deleteSuite
);

export default router;
