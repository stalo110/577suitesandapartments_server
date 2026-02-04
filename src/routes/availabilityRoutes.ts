import { Router } from 'express';
import { checkAvailability } from '../controllers/availabilityController';

const router = Router();

router.post('/availability', checkAvailability);

export default router;
