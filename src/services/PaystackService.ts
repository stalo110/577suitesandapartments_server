import crypto from 'crypto';
import { Booking } from '../models/BookingModel';
import { Transaction } from '../models/TransactionModel';
import { paymentEvents } from '../events/paymentEvents';
import { createFetchClient, GatewayError, GatewayTimeoutError, HttpClient } from './httpClient';
import { logPayment, logPaymentError } from '../utils/paymentLogger';
import { getEnvValue, isValidPaystackSecretKey } from '../utils/paymentEnv';

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    status: string;
    amount: number;
    reference: string;
    gateway_response?: string;
    metadata?: Record<string, unknown>;
  };
}

const normalizeAmount = (amount: number) => Number(Number(amount).toFixed(2));
const mapPaystackGatewayError = (error: unknown) => {
  const plainMessage =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (/invalid key|invalid authorization|access denied/i.test(plainMessage)) {
    return new Error(
      'PAYSTACK_SECRET_KEY is invalid. Use your Paystack Secret Key (sk_test_... or sk_live_...) on the server, not the public key, and do not include "Bearer ".'
    );
  }

  if (error instanceof GatewayError) {
    const gatewayMessage = String((error.data as any)?.message || error.message || '');
    if (
      error.status === 401 ||
      /invalid key|invalid authorization|access denied/i.test(gatewayMessage)
    ) {
      return new Error(
        'PAYSTACK_SECRET_KEY is invalid. Use your Paystack Secret Key (sk_test_... or sk_live_...) on the server, not the public key, and do not include "Bearer ".'
      );
    }
  }
  return error;
};

class PaystackService {
  private client: HttpClient;
  private secretKey: string;
  private publicKey: string;
  private webhookSecret: string;

  constructor(client?: HttpClient) {
    this.secretKey = getEnvValue(
      'PAYSTACK_SECRET_KEY',
      'PAYSTACK_LIVE_SECRET_KEY',
      'PAYSTACK_SECRET_KEY_LIVE',
      'PAYSTACK_SECRET'
    );
    this.publicKey = getEnvValue(
      'PAYSTACK_PUBLIC_KEY',
      'PAYSTACK_LIVE_PUBLIC_KEY',
      'PAYSTACK_PUBLIC_KEY_LIVE',
      'PAYSTACK_PUBLIC'
    );
    this.webhookSecret = getEnvValue('PAYSTACK_WEBHOOK_SECRET') || this.secretKey;

    if (!this.secretKey) {
      throw new Error('PAYSTACK_SECRET_KEY is not configured');
    }
    if (!isValidPaystackSecretKey(this.secretKey)) {
      throw new Error(
        'PAYSTACK_SECRET_KEY format is invalid. It must be a Paystack secret key (sk_test_... or sk_live_...).'
      );
    }

    this.client =
      client ||
      createFetchClient('https://api.paystack.co', {
        Authorization: `Bearer ${this.secretKey}`,
      });
  }

  private async generateReference(orderId: number) {
    const base = `PAY-${orderId}-${Date.now()}`;
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
      email,
      amount: Math.round(Number(order.totalAmount) * 100),
      reference,
      callback_url: `${callbackBaseUrl}/verify-payment?gateway=paystack`,
      metadata: {
        order_id: order.id,
      },
    };

    await logPayment('paystack.initialize.request', {
      reference,
      orderId: order.id,
      payload,
    });

    try {
      const response = await this.client.request<PaystackInitializeResponse>(
        'POST',
        '/transaction/initialize',
        payload
      );

      if (!response.status) {
        throw new Error(response.message || 'Paystack initialization failed');
      }

      await Transaction.create({
        orderId: order.id,
        userId: userId ?? null,
        reference,
        gateway: 'paystack',
        amount: normalizeAmount(Number(order.totalAmount)),
        currency: 'NGN',
        status: 'pending',
        metadata: {
          request: payload,
          response,
        },
      });

      await logPayment('paystack.initialize.success', {
        reference,
        authorization_url: response.data.authorization_url,
      });

      return {
        authorization_url: response.data.authorization_url,
        reference,
        access_code: response.data.access_code,
      };
    } catch (error: any) {
      if (error instanceof GatewayTimeoutError) {
        await logPaymentError('paystack.initialize.timeout', { reference, orderId: order.id });
        throw new Error('Payment gateway timeout. Please try again.');
      }

      await logPaymentError('paystack.initialize.error', {
        reference,
        orderId: order.id,
        error: error.message,
        data: error instanceof GatewayError ? error.data : undefined,
      });

      throw mapPaystackGatewayError(error);
    }
  }

  async verify(reference: string) {
    await logPayment('paystack.verify.request', { reference });

    try {
      const response = await this.client.request<PaystackVerifyResponse>(
        'GET',
        `/transaction/verify/${reference}`
      );

      if (!response.status) {
        throw new Error(response.message || 'Paystack verification failed');
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

      const paystackData = response.data;
      const isSuccess = paystackData.status === 'success';
      const paidAmount = normalizeAmount(Number(paystackData.amount) / 100);
      const expectedAmount = normalizeAmount(Number(transaction.amount));

      if (isSuccess && paidAmount !== expectedAmount) {
        await logPaymentError('paystack.verify.amount_mismatch', {
          reference,
          expectedAmount,
          paidAmount,
        });
        throw new Error('Payment amount mismatch');
      }

      await transaction.update({
        status: isSuccess ? 'success' : 'failed',
        metadata: this.mergeMetadata(transaction.metadata as Record<string, unknown>, {
          verification: paystackData,
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
        gateway: 'paystack',
        reference,
        gateway_response: paystackData,
      });

      await logPayment('paystack.verify.result', {
        reference,
        status: isSuccess ? 'success' : 'failed',
      });

      return {
        success: isSuccess,
        transaction,
        gateway_response: paystackData,
      };
    } catch (error: any) {
      if (error instanceof GatewayTimeoutError) {
        await logPaymentError('paystack.verify.timeout', { reference });
        throw new Error('Payment gateway timeout. Please try again.');
      }

      await logPaymentError('paystack.verify.error', {
        reference,
        error: error.message,
        data: error instanceof GatewayError ? error.data : undefined,
      });
      throw mapPaystackGatewayError(error);
    }
  }

  validateWebhookSignature(rawBody: string, signature: string | undefined) {
    if (!signature) {
      return false;
    }
    const hash = crypto
      .createHmac('sha512', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    return hash === signature;
  }

  getPublicKey() {
    return this.publicKey;
  }
}

export default PaystackService;
