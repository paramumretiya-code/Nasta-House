import crypto from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { PaymentProvider, Payment, Order } from '../types.js';
import { realtimeService } from './realtime.js';

export class PaymentService {
  private keySecret: string;
  private webhookSecret: string;

  constructor() {
    this.keySecret = process.env.PAYMENT_KEY_SECRET || 'dev_secret_key';
    this.webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || 'dev_webhook_secret';
  }

  async createPaymentSession(
    orderId: string,
    provider: PaymentProvider
  ): Promise<{ payment: Payment; checkoutDetails: any }> {
    const db = await getDatabase();
    const order = await db.getOrderById(orderId);
    if (!order) {
      const err: any = new Error('Order not found');
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (order.payment_status === 'paid') {
      const err: any = new Error('Order is already paid');
      err.code = 'ORDER_ALREADY_PAID';
      err.status = 422;
      throw err;
    }

    if (!order.customer_acknowledged_edits) {
      const err: any = new Error('Revised order total must be acknowledged before starting payment.');
      err.code = 'CUSTOMER_CONFIRMATION_REQUIRED';
      err.status = 422;
      throw err;
    }

    // Mock or real provider order ID
    const providerOrderId = `order_rzp_${order.order_number}_${Date.now()}`;
    const payment = await db.createPaymentAttempt(orderId, provider, providerOrderId);

    // Prepare client checkout payload (public key, order_id, amount, currency)
    const checkoutDetails = {
      key: process.env.PAYMENT_KEY_ID || 'rzp_test_public_key',
      orderId: providerOrderId,
      amountPaise: payment.amount_paise,
      currency: payment.currency,
      shopName: 'Nasto House',
      description: `Order #${order.order_number}`,
      prefill: {
        contact: '',
        email: ''
      }
    };

    realtimeService.notifyPaymentStatusChanged(order, payment);
    return { payment, checkoutDetails };
  }

  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    if (!signature) return false;
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  }

  async processWebhook(provider: string, rawBody: string, signature: string, payload: any): Promise<void> {
    const db = await getDatabase();

    // Verify signature if webhook secret is configured and not in permissive dev mode
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev) {
      const valid = this.verifyWebhookSignature(rawBody, signature);
      if (!valid) {
        const err: any = new Error('Invalid webhook signature');
        err.code = 'INVALID_SIGNATURE';
        err.status = 401;
        throw err;
      }
    }

    // Process event idempotently
    const event = payload.event;
    if (event === 'payment.captured' || event === 'order.paid') {
      const providerPaymentId = payload.payload?.payment?.entity?.id || payload.paymentId || `pay_${Date.now()}`;
      const providerOrderId = payload.payload?.payment?.entity?.order_id || payload.orderId;

      const payments = await db.getAllPayments();
      const existingPayment = payments.find((p) => p.provider_order_id === providerOrderId);

      if (existingPayment) {
        if (existingPayment.status === 'succeeded') {
          console.log(`[Webhook] Duplicate event for payment ${existingPayment.id}; skipping idempotent execution.`);
          return;
        }

        const { order, payment } = await db.confirmPayment(
          existingPayment.order_id,
          existingPayment.id,
          providerPaymentId,
          'webhook'
        );

        realtimeService.notifyPaymentStatusChanged(order, payment);
      }
    }
  }

  async processDevMockPayment(orderId: string, paymentId: string): Promise<{ order: Order; payment: Payment }> {
    const db = await getDatabase();
    const mockProviderPaymentId = `pay_mock_${Date.now()}`;
    const result = await db.confirmPayment(orderId, paymentId, mockProviderPaymentId, 'customer_sandbox');
    realtimeService.notifyPaymentStatusChanged(result.order, result.payment);
    realtimeService.notifyOrderStatusChanged(result.order);
    realtimeService.notifyTableStatusChanged();
    return result;
  }
}

export const paymentService = new PaymentService();

