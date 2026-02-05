import { Router } from 'express';
import { getSuites, getSuiteById, updateSuite, deleteSuite } from '../controllers/suitesController';
import { uploadImages } from '../helpers/uploadImage';
import { authenticate, authorizeRoles } from '../middleware/auth';

const router = Router();

router.get('/suites', getSuites);
router.get('/suites/:id', getSuiteById);
router.put(
  '/suites/:id',
  authenticate,
  authorizeRoles('ADMIN'),
  uploadImages.array('images', 6),
  updateSuite
);
router.delete('/suites/:id', authenticate, authorizeRoles('ADMIN'), deleteSuite);

export default router;
