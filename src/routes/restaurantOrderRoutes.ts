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

const registerRoutes = (basePath: string) => {
  router.get(
    `${basePath}/restaurant-orders`,
    authenticate,
    authorizePermission('manage_restaurant_orders'),
    listRestaurantOrders
  );
  router.get(
    `${basePath}/restaurant-orders/:id`,
    authenticate,
    authorizePermission('manage_restaurant_orders'),
    getRestaurantOrderById
  );
  router.post(
    `${basePath}/restaurant-orders`,
    authenticate,
    authorizePermission('manage_restaurant_orders'),
    createRestaurantOrder
  );
  router.put(
    `${basePath}/restaurant-orders/:id/status`,
    authenticate,
    authorizePermission('manage_restaurant_orders'),
    updateRestaurantOrderStatus
  );
  router.put(
    `${basePath}/restaurant-orders/:id/payment`,
    authenticate,
    authorizePermission('manage_restaurant_orders'),
    updateRestaurantOrderPayment
  );
  router.get(
    `${basePath}/bookings/:bookingId/orders`,
    authenticate,
    authorizePermission('manage_restaurant_orders', 'manage_bookings'),
    getBookingRestaurantOrders
  );
};

registerRoutes('/admin');
registerRoutes('/api/admin');

export default router;
