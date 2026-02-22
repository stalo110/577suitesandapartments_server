import { Router } from 'express';
import {
  createRestaurantOrder,
  getBookingRestaurantOrders,
  getRestaurantOrderById,
  listRestaurantOrders,
  updateRestaurantOrderPayment,
  updateRestaurantOrderStatus,
} from '../controllers/restaurantOrderController';
import { authenticate, authorizePermission } from '../middleware/auth';

const router = Router();

router.get(
  '/admin/restaurant-orders',
  authenticate,
  authorizePermission('manage_restaurant_orders'),
  listRestaurantOrders
);
router.get(
  '/api/admin/restaurant-orders',
  authenticate,
  authorizePermission('manage_restaurant_orders'),
  listRestaurantOrders
);

router.get(
  '/admin/restaurant-orders/:id',
  authenticate,
  authorizePermission('manage_restaurant_orders'),
  getRestaurantOrderById
);
router.get(
  '/api/admin/restaurant-orders/:id',
  authenticate,
  authorizePermission('manage_restaurant_orders'),
  getRestaurantOrderById
);

router.post(
  '/admin/restaurant-orders',
  authenticate,
  authorizePermission('manage_restaurant_orders'),
  createRestaurantOrder
);
router.post(
  '/api/admin/restaurant-orders',
  authenticate,
  authorizePermission('manage_restaurant_orders'),
  createRestaurantOrder
);

router.put(
  '/admin/restaurant-orders/:id/status',
  authenticate,
  authorizePermission('manage_restaurant_orders'),
  updateRestaurantOrderStatus
);
router.put(
  '/api/admin/restaurant-orders/:id/status',
  authenticate,
  authorizePermission('manage_restaurant_orders'),
  updateRestaurantOrderStatus
);

router.put(
  '/admin/restaurant-orders/:id/payment',
  authenticate,
  authorizePermission('manage_restaurant_orders'),
  updateRestaurantOrderPayment
);
router.put(
  '/api/admin/restaurant-orders/:id/payment',
  authenticate,
  authorizePermission('manage_restaurant_orders'),
  updateRestaurantOrderPayment
);

router.get(
  '/admin/bookings/:bookingId/orders',
  authenticate,
  authorizePermission('manage_restaurant_orders', 'manage_bookings'),
  getBookingRestaurantOrders
);
router.get(
  '/api/admin/bookings/:bookingId/orders',
  authenticate,
  authorizePermission('manage_restaurant_orders', 'manage_bookings'),
  getBookingRestaurantOrders
);

export default router;
