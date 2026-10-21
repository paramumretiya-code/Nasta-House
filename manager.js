"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.managerRouter = void 0;
const express_1 = require("express");
const index_js_1 = require("../db/index.js");
const auth_js_1 = require("../middleware/auth.js");
const realtime_js_1 = require("../services/realtime.js");
exports.managerRouter = (0, express_1.Router)();
// Manager Login
exports.managerRouter.post('/manager/login', async (req, res, next) => {
    try {
        const { username, password } = req.body;
        const expectedUsername = process.env.MANAGER_DEFAULT_USERNAME || 'manager';
        const expectedPassword = process.env.MANAGER_DEFAULT_PASSWORD || 'admin123';
        if (username !== expectedUsername || password !== expectedPassword) {
            res.status(401).json({
                error: {
                    code: 'INVALID_CREDENTIALS',
                    message: 'Invalid username or password',
                    requestId: req.requestId || 'req-unknown'
                }
            });
            return;
        }
        const token = (0, auth_js_1.generateManagerToken)({
            id: 'manager-01',
            username,
            role: 'manager'
        });
        res.json({
            data: {
                token,
                user: {
                    id: 'manager-01',
                    username,
                    role: 'manager'
                }
            }
        });
    }
    catch (err) {
        next(err);
    }
});
// Current manager session check
exports.managerRouter.get('/manager/me', auth_js_1.requireManagerAuth, (req, res) => {
    res.json({
        data: req.user
    });
});
// List orders with filter
exports.managerRouter.get('/manager/orders', auth_js_1.requireManagerAuth, async (req, res, next) => {
    try {
        const { status, paymentStatus, limit } = req.query;
        const db = await (0, index_js_1.getDatabase)();
        const orders = await db.getOrders({
            status: status ? String(status) : undefined,
            paymentStatus: paymentStatus ? String(paymentStatus) : undefined,
            limit: limit ? Number(limit) : undefined
        });
        res.json({
            data: orders
        });
    }
    catch (err) {
        next(err);
    }
});
// Single order details
exports.managerRouter.get('/manager/orders/:orderId', auth_js_1.requireManagerAuth, async (req, res, next) => {
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
// Edit order items and notes (with version concurrency check)
exports.managerRouter.patch('/manager/orders/:orderId', auth_js_1.requireManagerAuth, async (req, res, next) => {
    try {
        const orderId = String(req.params.orderId);
        const { expectedVersion, items, managerNote } = req.body;
        if (expectedVersion === undefined || expectedVersion === null) {
            res.status(400).json({
                error: {
                    code: 'MISSING_VERSION',
                    message: 'expectedVersion field is required for optimistic concurrency control',
                    requestId: req.requestId || 'req-unknown'
                }
            });
            return;
        }
        const db = await (0, index_js_1.getDatabase)();
        const updatedOrder = await db.updateOrderItems({
            orderId,
            expectedVersion: Number(expectedVersion),
            items,
            managerNote,
            actorId: req.user?.id,
            actorName: req.user?.username || 'Manager'
        });
        realtime_js_1.realtimeService.notifyOrderUpdated(updatedOrder);
        res.json({
            data: updatedOrder
        });
    }
    catch (err) {
        next(err);
    }
});
// Transition order status
exports.managerRouter.post('/manager/orders/:orderId/status', auth_js_1.requireManagerAuth, async (req, res, next) => {
    try {
        const orderId = String(req.params.orderId);
        const { expectedVersion, status, reason } = req.body;
        if (expectedVersion === undefined || expectedVersion === null || !status) {
            res.status(400).json({
                error: {
                    code: 'INVALID_INPUT',
                    message: 'expectedVersion and status are required',
                    requestId: req.requestId || 'req-unknown'
                }
            });
            return;
        }
        const db = await (0, index_js_1.getDatabase)();
        const updatedOrder = await db.updateOrderStatus(orderId, Number(expectedVersion), status, reason, req.user?.id, req.user?.username || 'Manager');
        realtime_js_1.realtimeService.notifyOrderStatusChanged(updatedOrder);
        if (updatedOrder.table_id && (updatedOrder.status === 'completed' || updatedOrder.status === 'cancelled')) {
            realtime_js_1.realtimeService.notifyTableStatusChanged(updatedOrder.table_id, false);
        }
        res.json({
            data: updatedOrder
        });
    }
    catch (err) {
        next(err);
    }
});
// Record manual payment (Cash / Manual UPI)
exports.managerRouter.post('/manager/orders/:orderId/manual-payment', auth_js_1.requireManagerAuth, async (req, res, next) => {
    try {
        const orderId = String(req.params.orderId);
        const { expectedVersion, method, reference, note } = req.body;
        if (expectedVersion === undefined || expectedVersion === null || !method) {
            res.status(400).json({
                error: {
                    code: 'INVALID_INPUT',
                    message: 'expectedVersion and method (cash or manual_upi) are required',
                    requestId: req.requestId || 'req-unknown'
                }
            });
            return;
        }
        const db = await (0, index_js_1.getDatabase)();
        const { order, payment } = await db.recordManualPayment(orderId, Number(expectedVersion), method, reference, note, req.user?.id, req.user?.username || 'Manager');
        realtime_js_1.realtimeService.notifyPaymentStatusChanged(order, payment);
        realtime_js_1.realtimeService.notifyOrderStatusChanged(order);
        realtime_js_1.realtimeService.notifyTableStatusChanged(order.table_id || undefined, false);
        res.json({
            data: {
                order,
                payment
            }
        });
    }
    catch (err) {
        next(err);
    }
});
// Order audit logs
exports.managerRouter.get('/manager/orders/:orderId/audit-logs', auth_js_1.requireManagerAuth, async (req, res, next) => {
    try {
        const orderId = String(req.params.orderId);
        const db = await (0, index_js_1.getDatabase)();
        const logs = await db.getAuditLogs(orderId);
        res.json({
            data: logs
        });
    }
    catch (err) {
        next(err);
    }
});
// All payments
exports.managerRouter.get('/manager/payments', auth_js_1.requireManagerAuth, async (req, res, next) => {
    try {
        const db = await (0, index_js_1.getDatabase)();
        const payments = await db.getAllPayments();
        res.json({
            data: payments
        });
    }
    catch (err) {
        next(err);
    }
});
// Manager dashboard daily stats
exports.managerRouter.get('/manager/stats/today', auth_js_1.requireManagerAuth, async (req, res, next) => {
    try {
        const db = await (0, index_js_1.getDatabase)();
        const stats = await db.getDashboardStats();
        res.json({
            data: stats
        });
    }
    catch (err) {
        next(err);
    }
});
// Shop status for manager
exports.managerRouter.get('/manager/shop-status', auth_js_1.requireManagerAuth, async (req, res, next) => {
    try {
        const db = await (0, index_js_1.getDatabase)();
        const settings = await db.getShopSettings();
        res.json({
            data: {
                is_open: settings.is_open,
                merchant_name: settings.merchant_name,
                merchant_upi_id: settings.merchant_upi_id
            }
        });
    }
    catch (err) {
        next(err);
    }
});
// Toggle shop status
exports.managerRouter.post('/manager/shop-status', auth_js_1.requireManagerAuth, async (req, res, next) => {
    try {
        const { is_open } = req.body;
        if (typeof is_open !== 'boolean') {
            res.status(400).json({
                error: {
                    code: 'INVALID_INPUT',
                    message: 'is_open boolean field is required',
                    requestId: req.requestId || 'req-unknown'
                }
            });
            return;
        }
        const db = await (0, index_js_1.getDatabase)();
        const settings = await db.setShopOpen(is_open);
        realtime_js_1.realtimeService.notifyShopStatusChanged(is_open);
        res.json({
            data: settings
        });
    }
    catch (err) {
        next(err);
    }
});
// Menu item management routes
exports.managerRouter.post('/manager/menu/items', auth_js_1.requireManagerAuth, async (req, res, next) => {
    try {
        const { categoryId, name, description, pricePaise, imagePath, isAvailable, sortOrder } = req.body;
        if (!categoryId || !name || pricePaise === undefined || pricePaise < 0) {
            res.status(400).json({
                error: {
                    code: 'INVALID_INPUT',
                    message: 'categoryId, name, and valid pricePaise are required',
                    requestId: req.requestId || 'req-unknown'
                }
            });
            return;
        }
        const db = await (0, index_js_1.getDatabase)();
        const item = await db.createMenuItem({
            categoryId,
            name,
            description,
            pricePaise: Number(pricePaise),
            imagePath,
            isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true,
            sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0
        });
        realtime_js_1.realtimeService.notifyMenuUpdated('created', item);
        res.status(201).json({
            data: item
        });
    }
    catch (err) {
        next(err);
    }
});
exports.managerRouter.put('/manager/menu/items/:id', auth_js_1.requireManagerAuth, async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const { categoryId, name, description, pricePaise, imagePath, isAvailable, sortOrder } = req.body;
        const db = await (0, index_js_1.getDatabase)();
        const item = await db.updateMenuItem(id, {
            categoryId,
            name,
            description,
            pricePaise: pricePaise !== undefined ? Number(pricePaise) : undefined,
            imagePath,
            isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : undefined,
            sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined
        });
        realtime_js_1.realtimeService.notifyMenuUpdated('updated', item);
        res.json({
            data: item
        });
    }
    catch (err) {
        next(err);
    }
});
exports.managerRouter.patch('/manager/menu/items/:id/availability', auth_js_1.requireManagerAuth, async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const { isAvailable } = req.body;
        if (typeof isAvailable !== 'boolean') {
            res.status(400).json({
                error: {
                    code: 'INVALID_INPUT',
                    message: 'isAvailable boolean is required',
                    requestId: req.requestId || 'req-unknown'
                }
            });
            return;
        }
        const db = await (0, index_js_1.getDatabase)();
        const item = await db.setMenuItemAvailability(id, isAvailable);
        realtime_js_1.realtimeService.notifyMenuUpdated('availability_changed', item);
        res.json({
            data: item
        });
    }
    catch (err) {
        next(err);
    }
});
exports.managerRouter.delete('/manager/menu/items/:id', auth_js_1.requireManagerAuth, async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const db = await (0, index_js_1.getDatabase)();
        await db.deleteMenuItem(id);
        realtime_js_1.realtimeService.notifyMenuUpdated('deleted', { id });
        res.json({
            data: { success: true, id }
        });
    }
    catch (err) {
        next(err);
    }
});
