import { Request, Response } from 'express';
import { Payment } from '../models/PaymentModel';
import { Booking } from '../models/BookingModel';

export const initializePayment = async (req: Request, res: Response) => {
  try {
    const { bookingId, amount, gateway } = req.body;
    const parsedBookingId = Number(bookingId);

    if (!['PAYSTACK', 'FLUTTERWAVE'].includes(gateway)) {
      return res.status(400).json({ error: 'Unsupported payment gateway' });
    }

    const booking = await Booking.findByPk(parsedBookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const reference = `PAY${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const transactionId = `${gateway}-${Date.now()}`;

    const payment = await Payment.create({
      bookingId: parsedBookingId,
      amount,
      gateway,
      reference,
      transactionId,
      status: 'PENDING',
      paymentDetails: {
        providerReference: reference,
        checkoutUrl: `${process.env.PUBLIC_CLIENT_URL || 'http://localhost:3039'}/checkout`,
      },
    });

    return res.status(201).json({
      id: String(payment.id),
      reference,
      transactionId,
      amount: Number(payment.amount),
      gateway,
      checkoutUrl: (payment.paymentDetails as Record<string, unknown>)?.checkoutUrl,
    });
  } catch (_error) {
    return res.status(400).json({ error: 'Error initializing payment' });
  }
};

export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const { reference } = req.body;

    const payment = await Payment.findOne({ where: { reference } });
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    await payment.update({ status: 'PAID' });
    await Booking.update(
      { status: 'CONFIRMED', paymentStatus: 'PAID' },
      { where: { id: Number(payment.bookingId) } }
    );

    return res.json({
      id: String(payment.id),
      bookingId: String(payment.bookingId),
      amount: Number(payment.amount),
      gateway: payment.gateway,
      status: payment.status,
      reference: payment.reference,
      createdAt: payment.createdAt,
    });
  } catch (_error) {
    return res.status(400).json({ error: 'Error verifying payment' });
  }
};

export const getAdminPayments = async (_req: Request, res: Response) => {
  try {
    const payments = await Payment.findAll({ order: [['createdAt', 'DESC']] });
    return res.json(
      payments.map((payment) => ({
        id: String(payment.id),
        bookingId: String(payment.bookingId),
        amount: Number(payment.amount),
        gateway: payment.gateway,
        status: payment.status,
        reference: payment.reference,
        createdAt: payment.createdAt,
      }))
    );
  } catch (_error) {
    return res.status(500).json({ error: 'Error fetching payments' });
  }
};

export const downloadReceipt = async (req: Request, res: Response) => {
  try {
    const paymentId = String(req.params.paymentId);
    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const format = String(req.params.format);
    if (!['pdf', 'png'].includes(format)) {
      return res.status(400).json({ error: 'Format must be pdf or png' });
    }

    return res.json({
      message: `${format.toUpperCase()} receipt generation is enabled via receipt service integration`,
      paymentId: String(payment.id),
      reference: payment.reference,
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Error downloading receipt' });
  }
};
