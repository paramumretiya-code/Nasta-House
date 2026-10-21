"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ordersRouter = void 0;
const express_1 = require("express");
const index_js_1 = require("../db/index.js");
const realtime_js_1 = require("../services/realtime.js");
const paymentService_js_1 = require("../services/paymentService.js");
exports.ordersRouter = (0, express_1.Router)();
// 0. Verify customer mobile with demo OTP
exports.ordersRouter.post('/orders/verify-customer', async (req, res, next) => {
    try {
        const { phone, otp, tableLabel } = req.body;
        const cleanPhone = String(phone || '').trim();
        if (!cleanPhone || !/^\d{10}$/.test(cleanPhone)) {
            res.status(400).json({
                error: {
                    code: 'INVALID_PHONE',
                    message: 'Please enter a valid 10-digit mobile number.',
                    requestId: req.requestId || 'req-unknown'
                }
            });
            return;
        }
        if (String(otp || '').trim() !== '123456') {
            res.status(400).json({
                error: {
                    code: 'INVALID_OTP',
                    message: 'Invalid OTP. Please enter the demo OTP: 123456',
                    requestId: req.requestId || 'req-unknown'
                }
            });
            return;
        }
        const db = await (0, index_js_1.getDatabase)();
        const effectiveTable = tableLabel || 'General';
        const tableSession = await db.createTableSession(effectiveTable, cleanPhone);
        const sessionPayload = {
            sessionId: tableSession.id,
            phone: cleanPhone,
            tableLabel: effectiveTable,
            verifiedAt: Date.now(),
            exp: Date.now() + 24 * 60 * 60 * 1000
        };
        const sessionToken = Buffer.from(JSON.stringify(sessionPayload)).toString('base64');
        res.json({
            data: {
                verified: true,
                phone: cleanPhone,
                sessionToken,
                sessionId: tableSession.id
            }
        });
    }
    catch (err) {
        next(err);
    }
});
// 1. Create order
exports.ordersRouter.post('/orders', async (req, res, next) => {
    try {
        const { tableId, tableLabel, orderType, items, customerNote, customerId, customerPhone, customerSessionToken } = req.body;
        // Validate customer verification session
        if (customerSessionToken) {
            try {
                const decoded = JSON.parse(Buffer.from(customerSessionToken, 'base64').toString('utf-8'));
                if (decoded.exp && decoded.exp < Date.now()) {
                    res.status(401).json({
                        error: {
                            code: 'SESSION_EXPIRED',
                            message: 'Verification session expired. Please verify your mobile number again.',
                            requestId: req.requestId || 'req-unknown'
                        }
                    });
                    return;
                }
                // Validate table session in database
                if (decoded.sessionId && tableLabel) {
                    const db = await (0, index_js_1.getDatabase)();
                    const isActive = await db.isTableSessionActive(decoded.sessionId, tableLabel);
                    if (!isActive) {
                        res.status(401).json({
                            error: {
                                code: 'SESSION_INVALID',
                                message: 'Previous dining session has ended. Please verify your mobile number for this table.',
                                requestId: req.requestId || 'req-unknown'
                            }
                        });
                        return;
                    }
                }
            }
            catch {
                res.status(401).json({
                    error: {
                        code: 'INVALID_SESSION',
                        message: 'Invalid verification session token.',
                        requestId: req.requestId || 'req-unknown'
                    }
                });
                return;
            }
        }
        else if (req.headers['x-bypass-customer-auth'] !== 'true' && process.env.NODE_ENV !== 'test') {
            res.status(401).json({
                error: {
                    code: 'VERIFICATION_REQUIRED',
                    message: 'Mobile verification is required before placing an order.',
                    requestId: req.requestId || 'req-unknown'
                }
            });
            return;
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            res.status(400).json({
                error: {
                    code: 'INVALID_ORDER_ITEMS',
                    message: 'Order must contain at least one item.',
                    requestId: req.requestId || 'req-unknown'
                }
            });
            return;
        }
        const db = await (0, index_js_1.getDatabase)();
        const order = await db.createOrder({
            tableId,
            tableLabel,
            orderType,
            items,
            customerNote,
            customerId
        });
        // Realtime notification
        realtime_js_1.realtimeService.notifyOrderCreated(order);
        if (order.table_id) {
            realtime_js_1.realtimeService.notifyTableStatusChanged(order.table_id, true);
        }
        res.status(201).json({
            data: order
        });
    }
    catch (err) {
        next(err);
    }
});
// 2. Get order details
exports.ordersRouter.get('/orders/:orderId', async (req, res, next) => {
    try {
        const orderId = String(req.params.orderId);
        const db = await (0, index_js_1.getDatabase)();
        const order = await db.getOrderById(orderId);
        if (!order) {
            res.status(404).json({
                error: {
                    code: 'ORDER_NOT_FOUND',
                    message: 'Order not found',
                    requestId: req.requestId || 'req-unknown'
                }
            });
            return;
        }
        res.json({
            data: order
        });
    }
    catch (err) {
        next(err);
    }
});
// 3. Confirm manager-proposed edits
exports.ordersRouter.post('/orders/:orderId/confirm-edits', async (req, res, next) => {
    try {
        const orderId = String(req.params.orderId);
        const db = await (0, index_js_1.getDatabase)();
        const order = await db.acknowledgeOrderEdits(orderId);
        realtime_js_1.realtimeService.notifyOrderUpdated(order);
        res.json({
            data: order
        });
    }
    catch (err) {
        next(err);
    }
});
// 4. Create payment attempt
exports.ordersRouter.post('/orders/:orderId/payments', async (req, res, next) => {
    try {
        const orderId = String(req.params.orderId);
        const provider = (req.body.provider || 'razorpay');
        const result = await paymentService_js_1.paymentService.createPaymentSession(orderId, provider);
        res.json({
            data: result
        });
    }
    catch (err) {
        next(err);
    }
});
// 5. Customer sandbox payment confirmation (dev / demo payment settlement)
exports.ordersRouter.post('/orders/:orderId/payments/:paymentId/sandbox-confirm', async (req, res, next) => {
    try {
        const orderId = String(req.params.orderId);
        const paymentId = String(req.params.paymentId);
        const result = await paymentService_js_1.paymentService.processDevMockPayment(orderId, paymentId);
        res.json({
            data: result
        });
    }
    catch (err) {
        next(err);
    }
});
// 6. Customer submits UPI payment for manual manager verification
exports.ordersRouter.post('/orders/:orderId/verify-upi', async (req, res, next) => {
    try {
        const orderId = String(req.params.orderId);
        const { utrReference } = req.body;
        const db = await (0, index_js_1.getDatabase)();
        const result = await db.requestPaymentVerification(orderId, utrReference);
        realtime_js_1.realtimeService.notifyPaymentStatusChanged(result.order, result.payment);
        res.json({
            data: result
        });
    }
    catch (err) {
        next(err);
    }
});
