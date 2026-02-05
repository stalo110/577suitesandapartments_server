import { Router } from 'express';
import { getGalleryItemById, getGalleryItems } from '../controllers/galleryController';

const router = Router();

router.get('/gallery', getGalleryItems);
router.get('/gallery/:id', getGalleryItemById);

export default router;
