import { Router } from 'express';
import WebhookController from '../controllers/webhookController';

const router = Router();

// Webhook endpoints are public (no auth middleware)
router.post('/webhook/paystack', WebhookController.handlePaystackWebhook.bind(WebhookController));
router.post('/webhook/flutterwave', WebhookController.handleFlutterwaveWebhook.bind(WebhookController));

export default router;
