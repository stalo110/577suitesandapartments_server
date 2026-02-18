import { paymentEvents } from './paymentEvents';
import { Booking } from '../models/BookingModel';
import { Suite } from '../models/SuiteModel';
import {
  sendAdminPaymentNotification,
  sendPaymentConfirmationEmail,
} from '../utils/mailer';
import { logPaymentError, logPayment } from '../utils/paymentLogger';

paymentEvents.on('payment.successful', async ({ transaction, gateway, reference }) => {
  try {
    const booking = await Booking.findByPk(transaction.orderId, {
      include: [{ model: Suite, as: 'suite' }],
    });

    if (!booking || !booking.suite) {
      return;
    }

    await Promise.all([
      sendPaymentConfirmationEmail(
        booking.email,
        booking.guestName,
        booking.suite.name,
        Number(transaction.amount),
        reference
      ),
      sendAdminPaymentNotification(
        booking.guestName,
        booking.email,
        booking.suite.name,
        Number(transaction.amount),
        reference
      ),
    ]);

    await logPayment('payment.email.sent', {
      reference,
      gateway,
      bookingId: booking.id,
    });
  } catch (error: any) {
    await logPaymentError('payment.email.failed', {
      reference,
      error: error.message,
    });
  }
});
