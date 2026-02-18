import { Router } from 'express';
import { uploadImages } from '../helpers/uploadImage';
import { authenticate, authorizePermission } from '../middleware/auth';
import {
  createGalleryItem,
  deleteGalleryItem,
  getGalleryItemsAdmin,
  updateGalleryItem,
} from '../controllers/galleryController';

const router = Router();

router.get('/admin/gallery', authenticate, authorizePermission('manage_gallery'), getGalleryItemsAdmin);
router.post(
  '/admin/gallery',
  authenticate,
  authorizePermission('manage_gallery'),
  uploadImages.single('image'),
  createGalleryItem
);
router.put(
  '/admin/gallery/:id',
  authenticate,
  authorizePermission('manage_gallery'),
  uploadImages.single('image'),
  updateGalleryItem
);
router.delete('/admin/gallery/:id', authenticate, authorizePermission('manage_gallery'), deleteGalleryItem);

export default router;
