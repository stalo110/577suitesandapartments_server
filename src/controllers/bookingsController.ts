import { Op } from 'sequelize';
import { Request, Response } from 'express';
import { Booking } from '../models/BookingModel';
import { Suite } from '../models/SuiteModel';
import {
  sendAdminBookingNotification,
  sendBookingConfirmationEmail,
} from '../utils/mailer';

const toBookingResponse = (booking: Booking) => ({
  id: String(booking.id),
  suiteId: String(booking.suiteId),
  guestName: booking.guestName,
  email: booking.email,
  phone: booking.phone,
  checkIn: booking.checkIn,
  checkOut: booking.checkOut,
  totalAmount: Number(booking.totalAmount),
  numberOfGuests: booking.numberOfGuests,
  mealOrderName: booking.mealOrderName,
  mealOrderAmount: Number(booking.mealOrderAmount),
  otherOrderName: booking.otherOrderName,
  otherOrderAmount: Number(booking.otherOrderAmount),
  status: booking.status,
  paymentStatus: booking.paymentStatus,
  bookingReference: booking.bookingReference,
  createdAt: booking.createdAt,
  updatedAt: booking.updatedAt,
});

export const createBooking = async (req: Request, res: Response) => {
  try {
    const {
      suiteId,
      guestName,
      email,
      phone,
      checkIn,
      checkOut,
      totalAmount,
      numberOfGuests,
      mealOrderName,
      mealOrderAmount,
      otherOrderName,
      otherOrderAmount,
    } = req.body;

    const parsedSuiteId = Number(suiteId);

    const suite = await Suite.findByPk(parsedSuiteId);
    if (!suite || !suite.isAvailable) {
      return res.status(400).json({ error: 'Selected suite is not available' });
    }

    const overlappingBooking = await Booking.findOne({
      where: {
        suiteId: parsedSuiteId,
        status: { [Op.ne]: 'CANCELLED' },
        checkIn: { [Op.lt]: checkOut },
        checkOut: { [Op.gt]: checkIn },
      },
    });

    if (overlappingBooking) {
      return res.status(409).json({ error: 'Suite already booked for selected dates' });
    }

    const bookingReference = `BK${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const booking = await Booking.create({
      suiteId: parsedSuiteId,
      guestName,
      email,
      phone,
      checkIn,
      checkOut,
      totalAmount,
      numberOfGuests,
      mealOrderName,
      mealOrderAmount,
      otherOrderName,
      otherOrderAmount,
      bookingReference,
    });

    try {
      await Promise.all([
        sendBookingConfirmationEmail(
          email,
          bookingReference,
          guestName,
          suite.name,
          checkIn,
          checkOut,
          totalAmount
        ),
        sendAdminBookingNotification(
          bookingReference,
          suite.name,
          guestName,
          email,
          checkIn,
          checkOut,
          totalAmount
        ),
      ]);
    } catch (emailError) {
      console.error('Failed to send booking emails:', emailError);
    }

    return res.status(201).json(toBookingResponse(booking));
  } catch (_error) {
    return res.status(400).json({ error: 'Error creating booking' });
  }
};

export const getAdminBookings = async (_req: Request, res: Response) => {
  try {
    const bookings = await Booking.findAll({
      include: [{ model: Suite, as: 'suite' }],
      order: [['createdAt', 'DESC']],
    });

    return res.json(bookings.map(toBookingResponse));
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching bookings' });
  }
};

export const getBookingById = async (req: Request, res: Response) => {
  try {
    const bookingId = String(req.params.id);
    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    return res.json(toBookingResponse(booking));
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching booking' });
  }
};

export const updateBookingStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const bookingId = String(req.params.id);
    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    await booking.update({ status });
    return res.json(toBookingResponse(booking));
  } catch (_error) {
    return res.status(400).json({ error: 'Error updating booking status' });
  }
};

export const cancelBooking = async (req: Request, res: Response) => {
  try {
    const bookingId = String(req.params.id);
    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    await booking.update({ status: 'CANCELLED' });
    return res.json(toBookingResponse(booking));
  } catch (_error) {
    return res.status(500).json({ error: 'Error cancelling booking' });
  }
};
