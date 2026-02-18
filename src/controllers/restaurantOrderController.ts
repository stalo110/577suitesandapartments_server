import { Op } from 'sequelize';
import { Request, Response } from 'express';
import { sequelize } from '../db';
import { Booking } from '../models/BookingModel';
import { OrderItem, OrderItemType } from '../models/OrderItemModel';
import {
  RestaurantOrder,
  RestaurantOrderPaymentMethod,
  RestaurantOrderPaymentStatus,
  RestaurantOrderStatus,
} from '../models/RestaurantOrderModel';

interface RestaurantOrderItemInput {
  itemName: string;
  itemType: OrderItemType;
  quantity: number;
  unitPrice: number;
}

const parseNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
};

const roundCurrency = (value: number) => Number(value.toFixed(2));

const toLineTotal = (item: RestaurantOrderItemInput) =>
  roundCurrency(Math.max(0, item.quantity) * Math.max(0, item.unitPrice));

const normalizeItemType = (value: unknown): OrderItemType =>
  String(value || '').toLowerCase() === 'drink' ? 'drink' : 'food';

const normalizeItems = (value: unknown): RestaurantOrderItemInput[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((raw) => {
      const source = (raw || {}) as Record<string, unknown>;
      const quantity = Math.max(1, Math.floor(parseNumber(source.quantity, 1)));
      const unitPrice = Math.max(0, roundCurrency(parseNumber(source.unitPrice, 0)));
      const itemName = String(source.itemName || '').trim();
      if (!itemName) {
        return null;
      }

      return {
        itemName,
        itemType: normalizeItemType(source.itemType),
        quantity,
        unitPrice,
      };
    })
    .filter((item): item is RestaurantOrderItemInput => Boolean(item));
};

const serializeOrderItem = (item: OrderItem) => ({
  id: String(item.id),
  restaurantOrderId: String(item.restaurantOrderId),
  itemName: item.itemName,
  itemType: item.itemType,
  quantity: item.quantity,
  unitPrice: Number(item.unitPrice),
  lineTotal: Number(item.lineTotal),
});

const serializeOrder = (order: RestaurantOrder, items: OrderItem[] = []) => ({
  id: String(order.id),
  bookingId: order.bookingId ? String(order.bookingId) : null,
  roomNumber: order.roomNumber,
  guestName: order.guestName,
  guestEmail: order.guestEmail,
  guestPhone: order.guestPhone,
  orderDate: order.orderDate,
  status: order.status,
  paymentStatus: order.paymentStatus,
  paymentMethod: order.paymentMethod,
  totalAmount: Number(order.totalAmount),
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  items: items.map(serializeOrderItem),
});

const getOrderWithItems = async (orderId: string) => {
  const order = await RestaurantOrder.findByPk(orderId);
  if (!order) {
    return null;
  }

  const items = await OrderItem.findAll({
    where: { restaurantOrderId: order.id },
    order: [['id', 'ASC']],
  });

  return { order, items };
};

export const listRestaurantOrders = async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || '').toLowerCase();
    const paymentStatus = String(req.query.paymentStatus || '').toLowerCase();
    const bookingId = parseNumber(req.query.bookingId);
    const where: Record<string, unknown> = {};

    if (['pending', 'preparing', 'delivered', 'cancelled'].includes(status)) {
      where.status = status;
    }

    if (['unpaid', 'paid'].includes(paymentStatus)) {
      where.paymentStatus = paymentStatus;
    }

    if (bookingId) {
      where.bookingId = bookingId;
    }

    const orders = await RestaurantOrder.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    const orderIds = orders.map((order) => order.id);
    const items = await OrderItem.findAll({
      where: {
        ...(orderIds.length ? { restaurantOrderId: { [Op.in]: orderIds } } : { restaurantOrderId: -1 }),
      },
      order: [['id', 'ASC']],
    });

    const itemsByOrderId = items.reduce<Record<number, OrderItem[]>>((acc, item) => {
      if (!acc[item.restaurantOrderId]) {
        acc[item.restaurantOrderId] = [];
      }
      acc[item.restaurantOrderId].push(item);
      return acc;
    }, {});

    return res.json(orders.map((order) => serializeOrder(order, itemsByOrderId[order.id] || [])));
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching restaurant orders' });
  }
};

export const getRestaurantOrderById = async (req: Request, res: Response) => {
  try {
    const result = await getOrderWithItems(String(req.params.id));
    if (!result) {
      return res.status(404).json({ error: 'Restaurant order not found' });
    }

    return res.json(serializeOrder(result.order, result.items));
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching restaurant order' });
  }
};

export const createRestaurantOrder = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();

  try {
    const bookingId = req.body.bookingId ? parseNumber(req.body.bookingId) : null;
    const roomNumber = req.body.roomNumber ? String(req.body.roomNumber).trim() : null;
    const guestNameInput = req.body.guestName ? String(req.body.guestName).trim() : '';
    const guestEmailInput = req.body.guestEmail ? String(req.body.guestEmail).trim() : null;
    const guestPhoneInput = req.body.guestPhone ? String(req.body.guestPhone).trim() : null;
    const paymentMethod = String(req.body.paymentMethod || 'cash').toLowerCase() as RestaurantOrderPaymentMethod;
    const paymentStatus = String(req.body.paymentStatus || 'unpaid').toLowerCase() as RestaurantOrderPaymentStatus;
    const status = String(req.body.status || 'pending').toLowerCase() as RestaurantOrderStatus;
    const itemsInput = normalizeItems(req.body.items);

    if (!itemsInput.length) {
      await transaction.rollback();
      return res.status(400).json({ error: 'At least one order item is required' });
    }

    let booking: Booking | null = null;
    if (bookingId) {
      booking = await Booking.findByPk(bookingId, { transaction });
      if (!booking) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Booking not found' });
      }
    }

    const guestName = guestNameInput || booking?.guestName || '';
    if (!guestName) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Guest name is required' });
    }

    if (!booking && !roomNumber) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Room number is required for walk-in orders' });
    }

    const normalizedPaymentMethod: RestaurantOrderPaymentMethod =
      paymentMethod === 'transfer' || paymentMethod === 'card' ? paymentMethod : 'cash';
    const normalizedPaymentStatus: RestaurantOrderPaymentStatus =
      paymentStatus === 'paid' ? 'paid' : 'unpaid';
    const normalizedStatus: RestaurantOrderStatus =
      ['pending', 'preparing', 'delivered', 'cancelled'].includes(status) ? status : 'pending';

    const itemPayload = itemsInput.map((item) => ({
      ...item,
      lineTotal: toLineTotal(item),
    }));

    const computedTotal = roundCurrency(
      itemPayload.reduce((sum, item) => sum + item.lineTotal, 0)
    );

    const order = await RestaurantOrder.create(
      {
        bookingId: booking ? booking.id : null,
        roomNumber: roomNumber || null,
        guestName,
        guestEmail: guestEmailInput || booking?.email || null,
        guestPhone: guestPhoneInput || booking?.phone || null,
        orderDate: req.body.orderDate ? new Date(req.body.orderDate) : new Date(),
        status: normalizedStatus,
        paymentStatus: normalizedPaymentStatus,
        paymentMethod: normalizedPaymentMethod,
        totalAmount: computedTotal,
      },
      { transaction }
    );

    await OrderItem.bulkCreate(
      itemPayload.map((item) => ({
        restaurantOrderId: order.id,
        itemName: item.itemName,
        itemType: item.itemType,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      { transaction }
    );

    await transaction.commit();

    const created = await getOrderWithItems(String(order.id));
    return res.status(201).json(
      created ? serializeOrder(created.order, created.items) : serializeOrder(order, [])
    );
  } catch (_error) {
    await transaction.rollback();
    return res.status(400).json({ error: 'Error creating restaurant order' });
  }
};

export const updateRestaurantOrderStatus = async (req: Request, res: Response) => {
  try {
    const orderId = String(req.params.id);
    const status = String(req.body.status || '').toLowerCase() as RestaurantOrderStatus;

    if (!['pending', 'preparing', 'delivered', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const order = await RestaurantOrder.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Restaurant order not found' });
    }

    await order.update({ status });

    const updated = await getOrderWithItems(orderId);
    return res.json(updated ? serializeOrder(updated.order, updated.items) : serializeOrder(order, []));
  } catch (_error) {
    return res.status(400).json({ error: 'Error updating order status' });
  }
};

export const updateRestaurantOrderPayment = async (req: Request, res: Response) => {
  try {
    const orderId = String(req.params.id);
    const paymentStatus = String(req.body.paymentStatus || '').toLowerCase() as RestaurantOrderPaymentStatus;
    const paymentMethod = String(req.body.paymentMethod || '').toLowerCase() as RestaurantOrderPaymentMethod;

    if (!['paid', 'unpaid'].includes(paymentStatus)) {
      return res.status(400).json({ error: 'Invalid payment status value' });
    }

    if (!['cash', 'transfer', 'card'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method value' });
    }

    const order = await RestaurantOrder.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Restaurant order not found' });
    }

    await order.update({
      paymentStatus,
      paymentMethod,
    });

    const updated = await getOrderWithItems(orderId);
    return res.json(updated ? serializeOrder(updated.order, updated.items) : serializeOrder(order, []));
  } catch (_error) {
    return res.status(400).json({ error: 'Error updating payment status' });
  }
};

export const getBookingRestaurantOrders = async (req: Request, res: Response) => {
  try {
    const bookingId = parseNumber(req.params.bookingId);
    if (!bookingId) {
      return res.status(400).json({ error: 'Invalid booking id' });
    }

    const orders = await RestaurantOrder.findAll({
      where: { bookingId },
      order: [['createdAt', 'DESC']],
    });

    const orderIds = orders.map((order) => order.id);
    const items = await OrderItem.findAll({
      where: {
        ...(orderIds.length ? { restaurantOrderId: { [Op.in]: orderIds } } : { restaurantOrderId: -1 }),
      },
      order: [['id', 'ASC']],
    });

    const itemsByOrderId = items.reduce<Record<number, OrderItem[]>>((acc, item) => {
      if (!acc[item.restaurantOrderId]) {
        acc[item.restaurantOrderId] = [];
      }
      acc[item.restaurantOrderId].push(item);
      return acc;
    }, {});

    return res.json(orders.map((order) => serializeOrder(order, itemsByOrderId[order.id] || [])));
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching booking restaurant orders' });
  }
};
