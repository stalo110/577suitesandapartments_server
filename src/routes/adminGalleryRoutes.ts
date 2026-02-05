import { Router } from 'express';
import { uploadImages } from '../helpers/uploadImage';
import { authenticate, authorizeRoles } from '../middleware/auth';
import {
  createGalleryItem,
  deleteGalleryItem,
  getGalleryItemsAdmin,
  updateGalleryItem,
} from '../controllers/galleryController';

const router = Router();

router.get('/admin/gallery', authenticate, authorizeRoles('ADMIN'), getGalleryItemsAdmin);
router.post(
  '/admin/gallery',
  authenticate,
  authorizeRoles('ADMIN'),
  uploadImages.single('image'),
  createGalleryItem
);
router.put(
  '/admin/gallery/:id',
  authenticate,
  authorizeRoles('ADMIN'),
  uploadImages.single('image'),
  updateGalleryItem
);
router.delete('/admin/gallery/:id', authenticate, authorizeRoles('ADMIN'), deleteGalleryItem);

export default router;
