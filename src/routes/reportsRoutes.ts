import { Router } from 'express';
import {
  exportReport,
  getBookingReports,
  getOccupancyReports,
  getRevenueReports,
} from '../controllers/reportsController';
import { authenticate, authorizeRoles } from '../middleware/auth';

const router = Router();

router.get('/admin/reports/bookings', authenticate, authorizeRoles('ADMIN'), getBookingReports);
router.get('/admin/reports/revenue', authenticate, authorizeRoles('ADMIN'), getRevenueReports);
router.get('/admin/reports/occupancy', authenticate, authorizeRoles('ADMIN'), getOccupancyReports);
router.get('/admin/reports/:type/export', authenticate, authorizeRoles('ADMIN'), exportReport);

export default router;
