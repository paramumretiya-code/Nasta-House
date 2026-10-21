"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentService = exports.PaymentService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const index_js_1 = require("../db/index.js");
const realtime_js_1 = require("./realtime.js");
class PaymentService {
    keySecret;
    webhookSecret;
    constructor() {
        this.keySecret = process.env.PAYMENT_KEY_SECRET || 'dev_secret_key';
        this.webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || 'dev_webhook_secret';
    }
    async createPaymentSession(orderId, provider) {
        const db = await (0, index_js_1.getDatabase)();
        const order = await db.getOrderById(orderId);
        if (!order) {
            const err = new Error('Order not found');
            err.code = 'ORDER_NOT_FOUND';
            err.status = 404;
            throw err;
        }
        if (order.payment_status === 'paid') {
            const err = new Error('Order is already paid');
            err.code = 'ORDER_ALREADY_PAID';
            err.status = 422;
            throw err;
        }
        if (!order.customer_acknowledged_edits) {
            const err = new Error('Revised order total must be acknowledged before starting payment.');
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
        realtime_js_1.realtimeService.notifyPaymentStatusChanged(order, payment);
        return { payment, checkoutDetails };
    }
    verifyWebhookSignature(rawBody, signature) {
        if (!signature)
            return false;
        const expectedSignature = node_crypto_1.default
            .createHmac('sha256', this.webhookSecret)
            .update(rawBody)
            .digest('hex');
        return node_crypto_1.default.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    }
    async processWebhook(provider, rawBody, signature, payload) {
        const db = await (0, index_js_1.getDatabase)();
        // Verify signature if webhook secret is configured and not in permissive dev mode
        const isDev = process.env.NODE_ENV === 'development';
        if (!isDev) {
            const valid = this.verifyWebhookSignature(rawBody, signature);
            if (!valid) {
                const err = new Error('Invalid webhook signature');
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
                const { order, payment } = await db.confirmPayment(existingPayment.order_id, existingPayment.id, providerPaymentId, 'webhook');
                realtime_js_1.realtimeService.notifyPaymentStatusChanged(order, payment);
            }
        }
    }
    async processDevMockPayment(orderId, paymentId) {
        const db = await (0, index_js_1.getDatabase)();
        const mockProviderPaymentId = `pay_mock_${Date.now()}`;
        const result = await db.confirmPayment(orderId, paymentId, mockProviderPaymentId, 'customer_sandbox');
        realtime_js_1.realtimeService.notifyPaymentStatusChanged(result.order, result.payment);
        realtime_js_1.realtimeService.notifyOrderStatusChanged(result.order);
        realtime_js_1.realtimeService.notifyTableStatusChanged();
        return result;
    }
}
exports.PaymentService = PaymentService;
exports.paymentService = new PaymentService();
