"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realtimeService = exports.RealtimeService = void 0;
const ws_1 = require("ws");
class RealtimeService {
    wss;
    clients = new Set();
    heartbeatInterval;
    init(server) {
        this.wss = new ws_1.WebSocketServer({ server, path: '/ws' });
        this.wss.on('connection', (ws) => {
            const client = {
                ws,
                isAlive: true,
                orderSubscriptions: new Set(),
                subscribeAllOrders: false
            };
            this.clients.add(client);
            ws.on('pong', () => {
                client.isAlive = true;
            });
            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.action === 'subscribe_orders') {
                        // Manager subscription to all order updates
                        client.subscribeAllOrders = true;
                        ws.send(JSON.stringify({ type: 'subscribed', channel: 'orders' }));
                    }
                    else if (msg.action === 'subscribe_order' && msg.orderId) {
                        // Customer subscription to their specific order
                        client.orderSubscriptions.add(msg.orderId);
                        ws.send(JSON.stringify({ type: 'subscribed', channel: `order:${msg.orderId}` }));
                    }
                    else if (msg.action === 'unsubscribe_order' && msg.orderId) {
                        client.orderSubscriptions.delete(msg.orderId);
                    }
                    else if (msg.action === 'ping') {
                        ws.send(JSON.stringify({ type: 'pong' }));
                    }
                }
                catch {
                    // ignore invalid json
                }
            });
            ws.on('close', () => {
                this.clients.delete(client);
            });
            ws.on('error', () => {
                this.clients.delete(client);
            });
            // Send initial welcome/ready state
            ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
        });
        // Heartbeat every 30s
        this.heartbeatInterval = setInterval(() => {
            for (const client of this.clients) {
                if (!client.isAlive) {
                    client.ws.terminate();
                    this.clients.delete(client);
                    continue;
                }
                client.isAlive = false;
                client.ws.ping();
            }
        }, 30000);
    }
    broadcast(message, orderId) {
        const dataStr = JSON.stringify(message);
        for (const client of this.clients) {
            if (client.ws.readyState === ws_1.WebSocket.OPEN) {
                // Send if client is listening to all orders OR listening to this specific order
                const isTarget = client.subscribeAllOrders ||
                    (orderId && client.orderSubscriptions.has(orderId));
                if (isTarget) {
                    client.ws.send(dataStr);
                }
            }
        }
    }
    notifyOrderCreated(order) {
        const message = {
            type: 'order.created',
            payload: {
                orderId: order.id,
                orderNumber: order.order_number,
                status: order.status,
                paymentStatus: order.payment_status,
                totalPaise: order.total_paise,
                version: order.version,
                timestamp: new Date().toISOString(),
                data: order
            }
        };
        this.broadcast(message, order.id);
    }
    notifyOrderUpdated(order) {
        const message = {
            type: 'order.updated',
            payload: {
                orderId: order.id,
                orderNumber: order.order_number,
                status: order.status,
                paymentStatus: order.payment_status,
                totalPaise: order.total_paise,
                version: order.version,
                requiresAcknowledgment: !order.customer_acknowledged_edits,
                timestamp: new Date().toISOString(),
                data: order
            }
        };
        this.broadcast(message, order.id);
    }
    notifyOrderStatusChanged(order) {
        const message = {
            type: 'order.status_changed',
            payload: {
                orderId: order.id,
                orderNumber: order.order_number,
                status: order.status,
                paymentStatus: order.payment_status,
                version: order.version,
                timestamp: new Date().toISOString(),
                data: order
            }
        };
        this.broadcast(message, order.id);
    }
    notifyPaymentStatusChanged(order, payment) {
        const message = {
            type: 'payment.status_changed',
            payload: {
                orderId: order.id,
                orderNumber: order.order_number,
                status: order.status,
                paymentStatus: order.payment_status,
                version: order.version,
                timestamp: new Date().toISOString(),
                data: { order, payment }
            }
        };
        this.broadcast(message, order.id);
    }
    broadcastAll(message) {
        const dataStr = JSON.stringify(message);
        for (const client of this.clients) {
            if (client.ws.readyState === ws_1.WebSocket.OPEN) {
                client.ws.send(dataStr);
            }
        }
    }
    notifyShopStatusChanged(isOpen) {
        const message = {
            type: 'shop.status_changed',
            payload: {
                timestamp: new Date().toISOString(),
                isOpen,
                data: { isOpen }
            }
        };
        this.broadcastAll(message);
    }
    notifyTableStatusChanged(tableId, isOccupied) {
        const message = {
            type: 'table.status_changed',
            payload: {
                timestamp: new Date().toISOString(),
                tableId,
                isOccupied,
                data: { tableId, isOccupied }
            }
        };
        this.broadcastAll(message);
    }
    notifyMenuUpdated(action, item) {
        const message = {
            type: 'menu.updated',
            payload: {
                action,
                item,
                timestamp: new Date().toISOString(),
                data: { action, item }
            }
        };
        this.broadcastAll(message);
    }
    destroy() {
        clearInterval(this.heartbeatInterval);
        if (this.wss) {
            this.wss.close();
        }
    }
}
exports.RealtimeService = RealtimeService;
exports.realtimeService = new RealtimeService();
