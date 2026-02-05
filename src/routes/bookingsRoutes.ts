import { Router } from 'express';
import {
  createBooking,
  getAdminBookings,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
} from '../controllers/bookingsController';
import { authenticate, authorizeRoles } from '../middleware/auth';

const router = Router();

router.post('/bookings', createBooking);
router.get('/admin/bookings', authenticate, authorizeRoles('ADMIN'), getAdminBookings);
router.get('/bookings/:id', getBookingById);
router.put(
  '/admin/bookings/:id/status',
  authenticate,
  authorizeRoles('ADMIN'),
  updateBookingStatus
);
router.post('/bookings/:id/cancel', cancelBooking);

export default router;
