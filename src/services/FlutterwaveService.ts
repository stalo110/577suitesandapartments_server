import { Booking } from '../models/BookingModel';
import { Transaction } from '../models/TransactionModel';
import { paymentEvents } from '../events/paymentEvents';
import { createFetchClient, GatewayError, GatewayTimeoutError, HttpClient } from './httpClient';
import { logPayment, logPaymentError } from '../utils/paymentLogger';

interface FlutterwaveInitializeResponse {
  status: string;
  message: string;
  data: {
    link: string;
  };
}

interface FlutterwaveVerifyResponse {
  status: string;
  message: string;
  data: {
    status: string;
    amount: number;
    currency: string;
    tx_ref: string;
    processor_response?: string;
  };
}

const normalizeAmount = (amount: number) => Number(Number(amount).toFixed(2));

class FlutterwaveService {
  private client: HttpClient;
  private secretKey: string;
  private publicKey: string;
  private encryptionKey: string;
  private webhookHash: string;

  constructor(client?: HttpClient) {
    this.secretKey = process.env.FLUTTERWAVE_SECRET_KEY || '';
    this.publicKey = process.env.FLUTTERWAVE_PUBLIC_KEY || '';
    this.encryptionKey = process.env.FLUTTERWAVE_ENCRYPTION_KEY || '';
    this.webhookHash =
      process.env.FLUTTERWAVE_WEBHOOK_HASH ||
      process.env.FLUTTERWAVE_SECRET_HASH ||
      '';

    if (!this.secretKey) {
      throw new Error('FLUTTERWAVE_SECRET_KEY is not configured');
    }

    this.client =
      client ||
      createFetchClient('https://api.flutterwave.com/v3', {
        Authorization: `Bearer ${this.secretKey}`,
      });
  }

  private async generateReference(orderId: number) {
    const base = `FLW-${orderId}-${Date.now()}`;
    const existing = await Transaction.findOne({ where: { reference: base } });
    if (!existing) {
      return base;
    }
    return `${base}-${Date.now()}`;
  }

  private mergeMetadata(
    existing: Record<string, unknown> | null | undefined,
    next: Record<string, unknown>
  ) {
    return {
      ...(existing || {}),
      ...next,
    };
  }

  async initialize(order: Booking, email: string, callbackBaseUrl: string, userId?: number | null) {
    const reference = await this.generateReference(order.id);
    const payload = {
      tx_ref: reference,
      amount: normalizeAmount(Number(order.totalAmount)),
      currency: 'NGN',
      redirect_url: `${callbackBaseUrl}/verify-payment?gateway=flutterwave&reference=${encodeURIComponent(
        reference
      )}`,
      customer: {
        email,
      },
      meta: {
        order_id: order.id,
      },
    };

    await logPayment('flutterwave.initialize.request', {
      reference,
      orderId: order.id,
      payload,
    });

    try {
      const response = await this.client.request<FlutterwaveInitializeResponse>(
        'POST',
        '/payments',
        payload
      );

      if (response.status !== 'success') {
        throw new Error(response.message || 'Flutterwave initialization failed');
      }

      await Transaction.create({
        orderId: order.id,
        userId: userId ?? null,
        reference,
        gateway: 'flutterwave',
        amount: normalizeAmount(Number(order.totalAmount)),
        currency: 'NGN',
        status: 'pending',
        metadata: {
          request: payload,
          response,
        },
      });

      await logPayment('flutterwave.initialize.success', {
        reference,
        link: response.data.link,
      });

      return {
        link: response.data.link,
        reference,
      };
    } catch (error: any) {
      if (error instanceof GatewayTimeoutError) {
        await logPaymentError('flutterwave.initialize.timeout', {
          reference,
          orderId: order.id,
        });
        throw new Error('Payment gateway timeout. Please try again.');
      }

      await logPaymentError('flutterwave.initialize.error', {
        reference,
        orderId: order.id,
        error: error.message,
        data: error instanceof GatewayError ? error.data : undefined,
      });

      throw error;
    }
  }

  async verify(reference: string) {
    await logPayment('flutterwave.verify.request', { reference });

    try {
      const response = await this.client.request<FlutterwaveVerifyResponse>(
        'GET',
        `/transactions/${reference}/verify`
      );

      if (response.status !== 'success') {
        throw new Error(response.message || 'Flutterwave verification failed');
      }

      const transaction = await Transaction.findOne({
        where: { reference },
        include: [{ model: Booking, as: 'booking' }],
      });

      if (!transaction) {
        throw new Error(`Transaction not found: ${reference}`);
      }

      if (transaction.status === 'success') {
        if (transaction.booking && transaction.booking.paymentMethod !== 'card') {
          await transaction.booking.update({
            status: 'CONFIRMED',
            paymentStatus: 'PAID',
            paymentMethod: 'card',
          });
        }
        return { success: true, transaction, gateway_response: response.data };
      }

      const data = response.data;
      const isSuccess = data.status === 'successful';
      const paidAmount = normalizeAmount(Number(data.amount));
      const expectedAmount = normalizeAmount(Number(transaction.amount));

      if (isSuccess && paidAmount !== expectedAmount) {
        await logPaymentError('flutterwave.verify.amount_mismatch', {
          reference,
          expectedAmount,
          paidAmount,
        });
        throw new Error('Payment amount mismatch');
      }

      await transaction.update({
        status: isSuccess ? 'success' : 'failed',
        metadata: this.mergeMetadata(transaction.metadata as Record<string, unknown>, {
          verification: data,
          verified_at: new Date().toISOString(),
        }),
      });

      if (isSuccess && transaction.booking) {
        await transaction.booking.update({
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          paymentMethod: 'card',
        });
      }

      paymentEvents.emit(isSuccess ? 'payment.successful' : 'payment.failed', {
        transaction,
        gateway: 'flutterwave',
        reference,
        gateway_response: data,
      });

      await logPayment('flutterwave.verify.result', {
        reference,
        status: isSuccess ? 'success' : 'failed',
      });

      return { success: isSuccess, transaction, gateway_response: data };
    } catch (error: any) {
      if (error instanceof GatewayTimeoutError) {
        await logPaymentError('flutterwave.verify.timeout', { reference });
        throw new Error('Payment gateway timeout. Please try again.');
      }

      await logPaymentError('flutterwave.verify.error', {
        reference,
        error: error.message,
        data: error instanceof GatewayError ? error.data : undefined,
      });
      throw error;
    }
  }

  validateWebhookSignature(signature: string | undefined) {
    if (!signature) {
      return false;
    }
    return signature === this.webhookHash;
  }

  getPublicKey() {
    return this.publicKey;
  }

  getEncryptionKey() {
    return this.encryptionKey;
  }
}

export default FlutterwaveService;
