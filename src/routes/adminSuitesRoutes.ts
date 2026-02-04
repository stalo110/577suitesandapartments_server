import { Router } from 'express';
import { uploadImages } from '../helpers/uploadImage';
import { createSuite, updateSuite, deleteSuite } from '../controllers/suitesController';

const router = Router();
router.post('/admin/suites', uploadImages.array('images', 6), createSuite);
router.put('/admin/suites/:id', uploadImages.array('images', 6), updateSuite);
router.delete('/admin/suites/:id', deleteSuite);

export default router;
