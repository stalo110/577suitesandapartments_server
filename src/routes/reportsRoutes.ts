import { Router } from 'express';
import {
  exportReport,
  getBookingReports,
  getOccupancyReports,
  getRevenueReports,
  getSummaryReport,
} from '../controllers/reportsController';
import { authenticate, authorizePermission } from '../middleware/auth';

const router = Router();

router.get('/admin/reports/bookings', authenticate, authorizePermission('view_reports'), getBookingReports);
router.get('/admin/reports/revenue', authenticate, authorizePermission('view_reports'), getRevenueReports);
router.get('/admin/reports/occupancy', authenticate, authorizePermission('view_reports'), getOccupancyReports);
router.get('/admin/reports/summary', authenticate, authorizePermission('view_reports'), getSummaryReport);
router.get('/admin/reports/:type/export', authenticate, authorizePermission('view_reports'), exportReport);

export default router;
