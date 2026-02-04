import { Router } from 'express';
import { getSuites, getSuiteById } from '../controllers/suitesController';

const router = Router();

router.get('/suites', getSuites);
router.get('/suites/:id', getSuiteById);

export default router;
