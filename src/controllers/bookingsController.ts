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
  status: booking.status,
  paymentStatus: booking.paymentStatus,
  paymentMethod: booking.paymentMethod,
  manualBooking: booking.manualBooking,
  notes: booking.notes,
  bookingReference: booking.bookingReference,
  createdAt: booking.createdAt,
  updatedAt: booking.updatedAt,
});

const bookingOverlaps = async (suiteId: number, checkIn: string, checkOut: string, exceptId?: number) => {
  const where: Record<string, unknown> = {
    suiteId,
    status: { [Op.ne]: 'CANCELLED' },
    checkIn: { [Op.lt]: checkOut },
    checkOut: { [Op.gt]: checkIn },
  };

  if (exceptId) {
    where.id = { [Op.ne]: exceptId };
  }

  return Booking.findOne({ where });
};

const generateBookingReference = () =>
  `BK${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

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
    } = req.body;

    const parsedSuiteId = Number(suiteId);

    if (!parsedSuiteId || !guestName || !email || !phone || !checkIn || !checkOut) {
      return res.status(400).json({ error: 'Missing required booking fields' });
    }

    const suite = await Suite.findByPk(parsedSuiteId);
    if (!suite || !suite.isAvailable) {
      return res.status(400).json({ error: 'Selected suite is not available' });
    }

    const overlappingBooking = await bookingOverlaps(parsedSuiteId, checkIn, checkOut);
    if (overlappingBooking) {
      return res.status(409).json({ error: 'Suite already booked for selected dates' });
    }

    const booking = await Booking.create({
      suiteId: parsedSuiteId,
      guestName,
      email,
      phone,
      checkIn,
      checkOut,
      totalAmount,
      numberOfGuests,
      bookingReference: generateBookingReference(),
      paymentMethod: 'pending',
      manualBooking: false,
    });

    try {
      await Promise.all([
        sendBookingConfirmationEmail(
          email,
          booking.bookingReference,
          guestName,
          suite.name,
          checkIn,
          checkOut,
          Number(totalAmount)
        ),
        sendAdminBookingNotification(
          booking.bookingReference,
          suite.name,
          guestName,
          email,
          checkIn,
          checkOut,
          Number(totalAmount)
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

export const createAdminBooking = async (req: Request, res: Response) => {
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
      paymentMethod,
      notes,
    } = req.body;

    const parsedSuiteId = Number(suiteId);
    const guestCount = Math.max(1, Number(numberOfGuests || 1));

    if (!parsedSuiteId || !guestName || !email || !phone || !checkIn || !checkOut) {
      return res.status(400).json({ error: 'Missing required booking fields' });
    }

    const suite = await Suite.findByPk(parsedSuiteId);
    if (!suite || !suite.isAvailable) {
      return res.status(400).json({ error: 'Selected suite is not available' });
    }

    const overlappingBooking = await bookingOverlaps(parsedSuiteId, checkIn, checkOut);
    if (overlappingBooking) {
      return res.status(409).json({ error: 'Suite already booked for selected dates' });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (
      Number.isNaN(checkInDate.getTime()) ||
      Number.isNaN(checkOutDate.getTime()) ||
      checkOutDate <= checkInDate
    ) {
      return res.status(400).json({ error: 'Invalid check-in/check-out dates' });
    }
    const nights = Math.max(
      1,
      Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (24 * 60 * 60 * 1000))
    );
    const defaultTotal = Number(suite.price) * nights;

    const normalizedPaymentMethod =
      String(paymentMethod || 'cash').toLowerCase() === 'transfer'
        ? 'transfer'
        : String(paymentMethod || 'cash').toLowerCase() === 'card'
          ? 'card'
          : String(paymentMethod || 'cash').toLowerCase() === 'pending'
            ? 'pending'
            : 'cash';

    const isImmediatePayment =
      normalizedPaymentMethod === 'cash' || normalizedPaymentMethod === 'transfer';

    const booking = await Booking.create({
      suiteId: parsedSuiteId,
      guestName,
      email,
      phone,
      checkIn,
      checkOut,
      totalAmount: Number(totalAmount || defaultTotal),
      numberOfGuests: guestCount,
      bookingReference: generateBookingReference(),
      paymentMethod: normalizedPaymentMethod,
      paymentStatus: isImmediatePayment ? 'PAID' : 'UNPAID',
      status: isImmediatePayment ? 'CONFIRMED' : 'PENDING',
      manualBooking: true,
      notes: notes ? String(notes) : null,
    });

    return res.status(201).json(toBookingResponse(booking));
  } catch (_error) {
    return res.status(400).json({ error: 'Error creating admin booking' });
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
