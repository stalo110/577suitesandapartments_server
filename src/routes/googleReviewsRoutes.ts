import { Router } from 'express';
import { getGoogleReviews } from '../controllers/googleReviewsController';

const router = Router();

router.get('/google-reviews', getGoogleReviews);
router.get('/public/google-reviews', getGoogleReviews);
router.get('/api/public/google-reviews', getGoogleReviews);

export default router;
