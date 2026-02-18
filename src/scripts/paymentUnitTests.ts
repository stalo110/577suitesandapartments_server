import assert from 'node:assert/strict';
import crypto from 'crypto';
import PaystackService from '../services/PaystackService';
import FlutterwaveService from '../services/FlutterwaveService';
import { Transaction } from '../models/TransactionModel';
import type { HttpClient } from '../services/httpClient';

const run = async () => {
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_unit';
  process.env.PAYSTACK_PUBLIC_KEY = 'pk_test_unit';
  process.env.PAYSTACK_WEBHOOK_SECRET = 'paystack_webhook_test';

  process.env.FLUTTERWAVE_SECRET_KEY = 'flw_secret_unit';
  process.env.FLUTTERWAVE_PUBLIC_KEY = 'flw_public_unit';
  process.env.FLUTTERWAVE_ENCRYPTION_KEY = 'flw_encrypt_unit';
  process.env.FLUTTERWAVE_WEBHOOK_HASH = 'flutterwave_webhook_hash';

  const originalFindOne = Transaction.findOne;
  const originalCreate = Transaction.create;

  (Transaction as any).findOne = async () => null;
  let createdPayload: any = null;
  (Transaction as any).create = async (payload: any) => {
    createdPayload = payload;
    return payload;
  };

  try {
    const mockPaystackClient: HttpClient = {
      async request(_method, path, body) {
        return {
          status: true,
          message: 'initialized',
          data: {
            authorization_url: 'https://paystack.test/checkout',
            access_code: 'ACCESS123',
            reference: (body as any).reference,
          },
        } as any;
      },
    };

    const paystackService = new PaystackService(mockPaystackClient);
    const order = { id: 42, totalAmount: 25000 } as any;
    const initResult = await paystackService.initialize(
      order,
      'guest@example.com',
      'http://localhost:4000'
    );

    assert.ok(initResult.authorization_url.includes('paystack.test'));
    assert.ok(initResult.reference.startsWith('PAY-42-'));
    assert.equal(createdPayload.gateway, 'paystack');
    assert.equal(Number(createdPayload.amount), 25000);

    const rawBody = JSON.stringify({ event: 'test', data: { reference: 'PAY-42' } });
    const signature = crypto
      .createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET || '')
      .update(rawBody)
      .digest('hex');
    assert.equal(paystackService.validateWebhookSignature(rawBody, signature), true);
    assert.equal(paystackService.validateWebhookSignature(rawBody, 'invalid'), false);

    const mockFlutterwaveClient: HttpClient = {
      async request(_method, _path, body) {
        return {
          status: 'success',
          message: 'initialized',
          data: {
            link: 'https://flutterwave.test/checkout',
          },
        } as any;
      },
    };

    const flutterwaveService = new FlutterwaveService(mockFlutterwaveClient);
    const flwResult = await flutterwaveService.initialize(
      order,
      'guest@example.com',
      'http://localhost:4000'
    );
    assert.ok(flwResult.link.includes('flutterwave.test'));
    assert.ok(flwResult.reference.startsWith('FLW-42-'));

    assert.equal(flutterwaveService.validateWebhookSignature('flutterwave_webhook_hash'), true);
    assert.equal(flutterwaveService.validateWebhookSignature('invalid'), false);

    console.log('Payment unit tests passed');
  } finally {
    Transaction.findOne = originalFindOne;
    Transaction.create = originalCreate;
  }
};

run().catch((error) => {
  console.error('Payment unit tests failed:', error);
  process.exit(1);
});
