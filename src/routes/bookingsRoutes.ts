import { Router } from 'express';
import {
  createBooking,
  getAdminBookings,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
} from '../controllers/bookingsController';

const router = Router();

router.post('/bookings', createBooking);
router.get('/admin/bookings', getAdminBookings);
router.get('/bookings/:id', getBookingById);
router.put('/admin/bookings/:id/status', updateBookingStatus);
router.post('/bookings/:id/cancel', cancelBooking);

export default router;
