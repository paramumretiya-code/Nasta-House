import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'node:http';
import { Order, Payment, RealtimeMessage } from '../types.js';

interface ClientConnection {
  ws: WebSocket;
  isAlive: boolean;
  role?: string;
  orderSubscriptions: Set<string>; // orderIds
  subscribeAllOrders: boolean;
}

export class RealtimeService {
  private wss!: WebSocketServer;
  private clients = new Set<ClientConnection>();
  private heartbeatInterval!: NodeJS.Timeout;

  init(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      const client: ClientConnection = {
        ws,
        isAlive: true,
        orderSubscriptions: new Set(),
        subscribeAllOrders: false
      };
      this.clients.add(client);

      ws.on('pong', () => {
        client.isAlive = true;
      });

      ws.on('message', (data: string) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.action === 'subscribe_orders') {
            // Manager subscription to all order updates
            client.subscribeAllOrders = true;
            ws.send(JSON.stringify({ type: 'subscribed', channel: 'orders' }));
          } else if (msg.action === 'subscribe_order' && msg.orderId) {
            // Customer subscription to their specific order
            client.orderSubscriptions.add(msg.orderId);
            ws.send(JSON.stringify({ type: 'subscribed', channel: `order:${msg.orderId}` }));
          } else if (msg.action === 'unsubscribe_order' && msg.orderId) {
            client.orderSubscriptions.delete(msg.orderId);
          } else if (msg.action === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {
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

  broadcast(message: RealtimeMessage, orderId?: string): void {
    const dataStr = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        // Send if client is listening to all orders OR listening to this specific order
        const isTarget =
          client.subscribeAllOrders ||
          (orderId && client.orderSubscriptions.has(orderId));

        if (isTarget) {
          client.ws.send(dataStr);
        }
      }
    }
  }

  notifyOrderCreated(order: Order): void {
    const message: RealtimeMessage = {
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

  notifyOrderUpdated(order: Order): void {
    const message: RealtimeMessage = {
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

  notifyOrderStatusChanged(order: Order): void {
    const message: RealtimeMessage = {
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

  notifyPaymentStatusChanged(order: Order, payment?: Payment): void {
    const message: RealtimeMessage = {
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

  broadcastAll(message: RealtimeMessage): void {
    const dataStr = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(dataStr);
      }
    }
  }

  notifyShopStatusChanged(isOpen: boolean): void {
    const message: RealtimeMessage = {
      type: 'shop.status_changed',
      payload: {
        timestamp: new Date().toISOString(),
        isOpen,
        data: { isOpen }
      }
    };
    this.broadcastAll(message);
  }

  notifyTableStatusChanged(tableId?: string, isOccupied?: boolean): void {
    const message: RealtimeMessage = {
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

  notifyMenuUpdated(action: 'created' | 'updated' | 'deleted' | 'availability_changed', item?: any): void {
    const message: RealtimeMessage = {
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

  destroy(): void {
    clearInterval(this.heartbeatInterval);
    if (this.wss) {
      this.wss.close();
    }
  }
}

export const realtimeService = new RealtimeService();

