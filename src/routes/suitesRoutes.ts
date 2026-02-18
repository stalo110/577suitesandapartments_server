import { Router } from 'express';
import { getSuites, getSuiteById, updateSuite, deleteSuite } from '../controllers/suitesController';
import { uploadImages } from '../helpers/uploadImage';
import { authenticate, authorizePermission } from '../middleware/auth';

const router = Router();

router.get('/suites', getSuites);
router.get('/suites/:id', getSuiteById);
router.put(
  '/suites/:id',
  authenticate,
  authorizePermission('manage_suites'),
  uploadImages.array('images', 6),
  updateSuite
);
router.delete('/suites/:id', authenticate, authorizePermission('manage_suites'), deleteSuite);

export default router;
