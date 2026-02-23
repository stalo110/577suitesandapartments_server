import { Router } from 'express';
import {
  createAdminBooking,
  createBooking,
  getAdminBookings,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
  downloadAdminBookingReceipt,
} from '../controllers/bookingsController';
import { authenticate, authorizePermission } from '../middleware/auth';

const router = Router();

router.post('/bookings', createBooking);
router.post(
  '/admin/bookings',
  authenticate,
  authorizePermission('manage_bookings'),
  createAdminBooking
);
router.post(
  '/api/admin/bookings',
  authenticate,
  authorizePermission('manage_bookings'),
  createAdminBooking
);
router.get('/admin/bookings', authenticate, authorizePermission('manage_bookings'), getAdminBookings);
router.get('/api/admin/bookings', authenticate, authorizePermission('manage_bookings'), getAdminBookings);
router.get('/bookings/:id', getBookingById);
router.get(
  '/admin/bookings/:id/receipt/:format',
  authenticate,
  authorizePermission('manage_bookings'),
  downloadAdminBookingReceipt
);
router.get(
  '/api/admin/bookings/:id/receipt/:format',
  authenticate,
  authorizePermission('manage_bookings'),
  downloadAdminBookingReceipt
);
router.put(
  '/admin/bookings/:id/status',
  authenticate,
  authorizePermission('manage_bookings'),
  updateBookingStatus
);
router.put(
  '/api/admin/bookings/:id/status',
  authenticate,
  authorizePermission('manage_bookings'),
  updateBookingStatus
);
router.post('/bookings/:id/cancel', cancelBooking);

export default router;
