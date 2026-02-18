import { Request, Response } from 'express';
import PaystackService from '../services/PaystackService';
import FlutterwaveService from '../services/FlutterwaveService';
import { Transaction } from '../models/TransactionModel';
import { Payment } from '../models/PaymentModel';
import { Booking } from '../models/BookingModel';
import { paymentEvents } from '../events/paymentEvents';
import { logWebhook, logWebhookError, logPayment } from '../utils/paymentLogger';

const normalizeAmount = (amount: number) => Number(Number(amount).toFixed(2));

class WebhookController {
  private paystackService: PaystackService;
  private flutterwaveService: FlutterwaveService;

  constructor() {
    this.paystackService = new PaystackService();
    this.flutterwaveService = new FlutterwaveService();
  }

  async handlePaystackWebhook(req: Request, res: Response) {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-paystack-signature'] as string | undefined;
    const payload = req.body;

    await logWebhook('paystack.webhook.received', {
      headers: { 'x-paystack-signature': signature },
      payload,
    });

    if (!this.paystackService.validateWebhookSignature(rawBody, signature)) {
      await logWebhookError('paystack.webhook.invalid_signature', {
        signatureProvided: Boolean(signature),
      });
      return res.status(401).json({ status: 'invalid signature' });
    }

    try {
      switch (payload.event) {
        case 'charge.success':
          await this.handlePaystackChargeSuccess(payload.data);
          break;
        case 'charge.failed':
          await this.handlePaystackChargeFailed(payload.data);
          break;
        default:
          await logWebhook('paystack.webhook.unhandled_event', { event: payload.event });
      }
    } catch (error: any) {
      await logWebhookError('paystack.webhook.processing_error', {
        event: payload.event,
        error: error.message,
      });
    }

    return res.status(200).json({ status: 'ok' });
  }

  async handleFlutterwaveWebhook(req: Request, res: Response) {
    const signature = req.headers['verif-hash'] as string | undefined;
    const payload = req.body;

    await logWebhook('flutterwave.webhook.received', {
      headers: { 'verif-hash': signature },
      payload,
    });

    if (!this.flutterwaveService.validateWebhookSignature(signature)) {
      await logWebhookError('flutterwave.webhook.invalid_signature', {
        signatureProvided: Boolean(signature),
      });
      return res.status(401).json({ status: 'unauthorized' });
    }

    try {
      switch (payload.event) {
        case 'charge.completed':
          await this.handleFlutterwaveChargeCompleted(payload.data);
          break;
        case 'charge.failed':
          await this.handleFlutterwaveChargeFailed(payload.data);
          break;
        default:
          await logWebhook('flutterwave.webhook.unhandled_event', { event: payload.event });
      }
    } catch (error: any) {
      await logWebhookError('flutterwave.webhook.processing_error', {
        event: payload.event,
        error: error.message,
      });
    }

    return res.status(200).json({ status: 'ok' });
  }

  private async handlePaystackChargeSuccess(data: any) {
    const reference = data?.reference as string | undefined;

    if (!reference) {
      await logWebhookError('paystack.webhook.missing_reference', { data });
      return;
    }

    const transaction = await Transaction.findOne({
      where: { reference },
      include: [{ model: Booking, as: 'booking' }],
    });

    if (!transaction) {
      await logWebhookError('paystack.webhook.transaction_not_found', { reference });
      return;
    }

    if (transaction.status === 'success') {
      await logWebhook('paystack.webhook.idempotent_success', { reference });
      return;
    }

    const paidAmount = normalizeAmount(Number(data?.amount || 0) / 100);
    const expectedAmount = normalizeAmount(Number(transaction.amount));

    if (paidAmount !== expectedAmount) {
      await logWebhookError('paystack.webhook.amount_mismatch', {
        reference,
        expectedAmount,
        paidAmount,
      });
      return;
    }

    await transaction.update({
      status: 'success',
      metadata: {
        ...(transaction.metadata as Record<string, unknown>),
        webhook: data,
        webhook_processed_at: new Date().toISOString(),
      },
    });

    if (transaction.booking) {
      await transaction.booking.update({
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        paymentMethod: 'card',
      });
    }

    const payment = await Payment.findOne({ where: { reference } });
    if (payment) {
      await payment.update({
        status: 'PAID',
        paymentDetails: {
          ...(payment.paymentDetails as Record<string, unknown>),
          webhook: data,
        },
      });
    }

    paymentEvents.emit('payment.successful', {
      transaction,
      gateway: 'paystack',
      reference,
      webhook: true,
    });

    await logPayment('paystack.webhook.processed', {
      reference,
      status: 'success',
    });
  }

  private async handlePaystackChargeFailed(data: any) {
    const reference = data?.reference as string | undefined;

    if (!reference) {
      await logWebhookError('paystack.webhook.failed_missing_reference', { data });
      return;
    }

    const transaction = await Transaction.findOne({ where: { reference } });
    if (transaction && transaction.status === 'success') {
      await logWebhook('paystack.webhook.failed_but_already_success', { reference });
      return;
    }

    if (transaction) {
      await transaction.update({
        status: 'failed',
        metadata: {
          ...(transaction.metadata as Record<string, unknown>),
          webhook: data,
          webhook_processed_at: new Date().toISOString(),
        },
      });
    }

    const payment = await Payment.findOne({ where: { reference } });
    if (payment) {
      await payment.update({
        status: 'FAILED',
        paymentDetails: {
          ...(payment.paymentDetails as Record<string, unknown>),
          webhook: data,
        },
      });
    }

    await logPayment('paystack.webhook.processed', {
      reference,
      status: 'failed',
    });
  }

  private async handleFlutterwaveChargeCompleted(data: any) {
    const reference = data?.tx_ref as string | undefined;
    const status = data?.status as string | undefined;

    if (!reference) {
      await logWebhookError('flutterwave.webhook.missing_reference', { data });
      return;
    }

    if (status !== 'successful') {
      await logWebhook('flutterwave.webhook.non_success_status', { reference, status });
      return;
    }

    const transaction = await Transaction.findOne({
      where: { reference },
      include: [{ model: Booking, as: 'booking' }],
    });

    if (!transaction) {
      await logWebhookError('flutterwave.webhook.transaction_not_found', { reference });
      return;
    }

    if (transaction.status === 'success') {
      await logWebhook('flutterwave.webhook.idempotent_success', { reference });
      return;
    }

    const paidAmount = normalizeAmount(Number(data?.amount || 0));
    const expectedAmount = normalizeAmount(Number(transaction.amount));

    if (paidAmount !== expectedAmount) {
      await logWebhookError('flutterwave.webhook.amount_mismatch', {
        reference,
        expectedAmount,
        paidAmount,
      });
      return;
    }

    await transaction.update({
      status: 'success',
      metadata: {
        ...(transaction.metadata as Record<string, unknown>),
        webhook: data,
        webhook_processed_at: new Date().toISOString(),
      },
    });

    if (transaction.booking) {
      await transaction.booking.update({
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        paymentMethod: 'card',
      });
    }

    const payment = await Payment.findOne({ where: { reference } });
    if (payment) {
      await payment.update({
        status: 'PAID',
        paymentDetails: {
          ...(payment.paymentDetails as Record<string, unknown>),
          webhook: data,
        },
      });
    }

    paymentEvents.emit('payment.successful', {
      transaction,
      gateway: 'flutterwave',
      reference,
      webhook: true,
    });

    await logPayment('flutterwave.webhook.processed', {
      reference,
      status: 'success',
    });
  }

  private async handleFlutterwaveChargeFailed(data: any) {
    const reference = data?.tx_ref as string | undefined;

    if (!reference) {
      await logWebhookError('flutterwave.webhook.failed_missing_reference', { data });
      return;
    }

    const transaction = await Transaction.findOne({ where: { reference } });
    if (transaction && transaction.status === 'success') {
      await logWebhook('flutterwave.webhook.failed_but_already_success', { reference });
      return;
    }

    if (transaction) {
      await transaction.update({
        status: 'failed',
        metadata: {
          ...(transaction.metadata as Record<string, unknown>),
          webhook: data,
          webhook_processed_at: new Date().toISOString(),
        },
      });
    }

    const payment = await Payment.findOne({ where: { reference } });
    if (payment) {
      await payment.update({
        status: 'FAILED',
        paymentDetails: {
          ...(payment.paymentDetails as Record<string, unknown>),
          webhook: data,
        },
      });
    }

    await logPayment('flutterwave.webhook.processed', {
      reference,
      status: 'failed',
    });
  }
}

export default new WebhookController();
