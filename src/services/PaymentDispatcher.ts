import PaystackService from './PaystackService';
import FlutterwaveService from './FlutterwaveService';
import { Booking } from '../models/BookingModel';
import { logPayment, logPaymentError } from '../utils/paymentLogger';

export type PaymentGateway = 'paystack' | 'flutterwave';

class PaymentDispatcher {
  private paystackService: PaystackService;
  private flutterwaveService: FlutterwaveService;

  constructor(
    paystackService: PaystackService = new PaystackService(),
    flutterwaveService: FlutterwaveService = new FlutterwaveService()
  ) {
    this.paystackService = paystackService;
    this.flutterwaveService = flutterwaveService;
  }

  private normalizeGateway(gateway: string): PaymentGateway {
    const normalized = gateway.toLowerCase();
    if (normalized === 'paystack' || normalized === 'flutterwave') {
      return normalized;
    }
    throw new Error(`Unsupported gateway: ${gateway}`);
  }

  async initiate(
    order: Booking,
    gateway: string,
    email: string,
    callbackBaseUrl: string,
    userId?: number | null
  ) {
    const normalized = this.normalizeGateway(gateway);

    await logPayment('payment.initiate.start', {
      orderId: order.id,
      gateway: normalized,
      email,
    });

    try {
      if (normalized === 'paystack') {
        return await this.paystackService.initialize(order, email, callbackBaseUrl, userId);
      }

      return await this.flutterwaveService.initialize(order, email, callbackBaseUrl, userId);
    } catch (error: any) {
      await logPaymentError('payment.initiate.failed', {
        orderId: order.id,
        gateway: normalized,
        error: error.message,
      });
      throw error;
    }
  }

  async verify(reference: string, gateway: string) {
    const normalized = this.normalizeGateway(gateway);

    await logPayment('payment.verify.start', { reference, gateway: normalized });

    if (normalized === 'paystack') {
      return this.paystackService.verify(reference);
    }

    return this.flutterwaveService.verify(reference);
  }

  getPublicKeys() {
    return {
      paystack: this.paystackService.getPublicKey(),
      flutterwave: this.flutterwaveService.getPublicKey(),
    };
  }
}

export default PaymentDispatcher;
