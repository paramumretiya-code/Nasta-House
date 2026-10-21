import {
  Category,
  MenuItem,
  DiningTable,
  Order,
  Payment,
  OrderAuditLog,
  ShopSettings,
  OrderStatus,
  OrderType,
  PaymentProvider,
  DashboardStats
} from '../types.js';

export interface CreateOrderInput {
  tableId?: string | null;
  tableLabel?: string | null;
  orderType?: OrderType;
  items: {
    menuItemId: string;
    quantity: number;
    itemNote?: string | null;
  }[];
  customerNote?: string | null;
  customerId?: string | null;
}

export interface UpdateOrderItemsInput {
  orderId: string;
  expectedVersion: number;
  items?: {
    menuItemId: string;
    quantity: number;
    itemNote?: string | null;
  }[];
  managerNote?: string | null;
  actorId?: string | null;
  actorName?: string | null;
}

export interface IDatabase {
  init(): Promise<void>;
  getMenu(): Promise<{ categories: Category[]; items: MenuItem[] }>;
  getDiningTables(): Promise<(DiningTable & { is_occupied: boolean; active_orders: Order[] })[]>;
  getShopSettings(): Promise<ShopSettings>;
  setShopOpen(isOpen: boolean): Promise<ShopSettings>;
  createOrder(input: CreateOrderInput): Promise<Order>;
  getOrderById(orderId: string): Promise<Order | null>;
  getOrders(filters?: { status?: string; paymentStatus?: string; limit?: number }): Promise<Order[]>;
  updateOrderItems(input: UpdateOrderItemsInput): Promise<Order>;
  updateOrderStatus(
    orderId: string,
    expectedVersion: number,
    newStatus: OrderStatus,
    reason?: string | null,
    actorId?: string | null,
    actorName?: string | null
  ): Promise<Order>;
  acknowledgeOrderEdits(orderId: string): Promise<Order>;
  createPaymentAttempt(
    orderId: string,
    provider: PaymentProvider,
    providerOrderId?: string | null
  ): Promise<Payment>;
  confirmPayment(
    orderId: string,
    paymentId: string,
    providerPaymentId: string,
    verifiedByRole?: string,
    actorId?: string | null
  ): Promise<{ order: Order; payment: Payment }>;
  recordManualPayment(
    orderId: string,
    expectedVersion: number,
    method: 'cash' | 'manual_upi',
    reference?: string | null,
    note?: string | null,
    actorId?: string | null,
    actorName?: string | null
  ): Promise<{ order: Order; payment: Payment }>;
  requestPaymentVerification(
    orderId: string,
    utrReference?: string | null
  ): Promise<{ order: Order; payment: Payment }>;
  getAuditLogs(orderId: string): Promise<OrderAuditLog[]>;
  getAllPayments(): Promise<Payment[]>;
  getDashboardStats(): Promise<DashboardStats>;
  createMenuItem(input: {
    categoryId: string;
    name: string;
    description?: string | null;
    pricePaise: number;
    imagePath?: string | null;
    isAvailable?: boolean;
    sortOrder?: number;
  }): Promise<MenuItem>;
  updateMenuItem(
    id: string,
    input: {
      categoryId?: string;
      name?: string;
      description?: string | null;
      pricePaise?: number;
      imagePath?: string | null;
      isAvailable?: boolean;
      sortOrder?: number;
    }
  ): Promise<MenuItem>;
  setMenuItemAvailability(id: string, isAvailable: boolean): Promise<MenuItem>;
  deleteMenuItem(id: string): Promise<boolean>;
  createTableSession(tableLabel: string, phone: string): Promise<{ id: string; tableLabel: string; customerPhone: string; status: string }>;
  getActiveTableSession(tableLabel: string): Promise<{ id: string; tableLabel: string; customerPhone: string; status: string } | null>;
  completeTableSession(tableLabel: string): Promise<void>;
  isTableSessionActive(sessionId: string, tableLabel: string): Promise<boolean>;
}
