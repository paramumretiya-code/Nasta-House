import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Category,
  MenuItem,
  DiningTable,
  Order,
  Payment,
  OrderAuditLog,
  ShopSettings,
  OrderStatus,
  PaymentProvider,
  DashboardStats
} from '../types.js';
import { IDatabase, CreateOrderInput, UpdateOrderItemsInput } from './database.js';

export class SupabaseDatabase implements IDatabase {
  private client: SupabaseClient;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });
  }

  async init(): Promise<void> {
    // Health check query
    const { error } = await this.client.from('shop_settings').select('id').limit(1);
    if (error) {
      console.warn('Supabase initialization check warning:', error.message);
    }
  }

  async getMenu(): Promise<{ categories: Category[]; items: MenuItem[] }> {
    const { data: categories, error: catError } = await this.client
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (catError) throw catError;

    const { data: items, error: itemError } = await this.client
      .from('menu_items')
      .select('*')
      .order('sort_order', { ascending: true });

    if (itemError) throw itemError;

    return {
      categories: categories as Category[],
      items: items as MenuItem[]
    };
  }

  async getDiningTables(): Promise<(DiningTable & { is_occupied: boolean; active_orders: Order[] })[]> {
    const { data: tables, error } = await this.client
      .from('dining_tables')
      .select('*')
      .eq('is_active', true)
      .order('label', { ascending: true });

    if (error) throw error;

    const { data: activeOrdersData } = await this.client
      .from('orders')
      .select('*, order_items(*)')
      .in('status', ['placed', 'accepted', 'preparing', 'ready'])
      .neq('payment_status', 'paid');

    const activeList = activeOrdersData || [];

    const result = (tables || []).map((tbl) => {
      const activeForTable = activeList.filter(
        (o: any) => o.table_id === tbl.id || o.table_label === tbl.label
      ).map((o: any) => ({
        ...o,
        customer_acknowledged_edits: Boolean(o.customer_acknowledged_edits),
        items: o.order_items || []
      }));

      return {
        ...tbl,
        is_occupied: activeForTable.length > 0,
        active_orders: activeForTable
      };
    });

    return result as (DiningTable & { is_occupied: boolean; active_orders: Order[] })[];
  }

  async getShopSettings(): Promise<ShopSettings> {
    const { data, error } = await this.client
      .from('shop_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return {
        id: 'default',
        shop_name: 'Nasto House Authentic Farsan & Sweets',
        currency: 'INR',
        tax_enabled: true,
        tax_rate_basis_points: 500,
        is_open: true,
        merchant_upi_id: 'paramumretiya@oksbi',
        merchant_name: 'Param Umretiya',
        updated_at: new Date().toISOString()
      };
    }

    return {
      ...data,
      is_open: data.is_open !== undefined ? Boolean(data.is_open) : true,
      merchant_upi_id: data.merchant_upi_id || 'paramumretiya@oksbi',
      merchant_name: data.merchant_name || 'Param Umretiya'
    } as ShopSettings;
  }

  async setShopOpen(isOpen: boolean): Promise<ShopSettings> {
    const settings = await this.getShopSettings();
    if (settings.id !== 'default') {
      await this.client
        .from('shop_settings')
        .update({ is_open: isOpen, updated_at: new Date().toISOString() })
        .eq('id', settings.id);
    }
    return await this.getShopSettings();
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const settings = await this.getShopSettings();
    const tables = await this.getDiningTables();

    const { data: allOrders } = await this.client
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(100);

    const orders = allOrders || [];
    const runningOrders = orders.filter((o: any) =>
      ['placed', 'accepted', 'preparing', 'ready'].includes(o.status)
    );

    // Filter today's completed orders in Asia/Kolkata
    const now = new Date();
    const todayDateString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const todayCompletedOrders = orders.filter((o: any) => {
      if (o.status !== 'completed') return false;
      const compDate = new Date(o.completed_at || o.updated_at || o.created_at);
      return compDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === todayDateString;
    });

    const { data: todayPayments } = await this.client
      .from('payments')
      .select('*')
      .eq('status', 'succeeded');

    const verifiedRevenue = (todayPayments || []).filter((p: any) => {
      const vDate = new Date(p.verified_at || p.created_at);
      return vDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === todayDateString;
    }).reduce((sum: number, p: any) => sum + (p.amount_paise || 0), 0);

    const occupiedTablesCount = tables.filter((t) => t.is_occupied).length;
    const availableTablesCount = Math.max(0, 10 - occupiedTablesCount);
    const awaitingPayment = orders.filter((o: any) => o.status !== 'cancelled' && o.payment_status !== 'paid').length;
    const totalCompletedValue = todayCompletedOrders.reduce((sum: number, o: any) => sum + (o.total_paise || 0), 0);

    return {
      runningOrdersCount: runningOrders.length,
      todayCompletedOrdersCount: todayCompletedOrders.length,
      todayVerifiedRevenuePaise: verifiedRevenue,
      todayCompletedOrdersValuePaise: totalCompletedValue,
      ordersAwaitingPaymentCount: awaitingPayment,
      occupiedTablesCount,
      availableTablesCount,
      isShopOpen: settings.is_open,
      recentActiveOrders: runningOrders as Order[],
      todayCompletedOrders: todayCompletedOrders as Order[]
    };
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    if (!input.items || input.items.length === 0) {
      const err: any = new Error('Order must contain at least one item');
      err.code = 'INVALID_ORDER_ITEMS';
      err.status = 400;
      throw err;
    }

    const settings = await this.getShopSettings();
    if (!settings.is_open) {
      const err: any = new Error("We're currently not accepting new orders. Please check again soon.");
      err.code = 'SHOP_CLOSED';
      err.status = 422;
      throw err;
    }

    let tableLabel = input.tableLabel || null;
    let tableId = input.tableId || null;
    if (tableLabel && !tableId) {
      const { data: t } = await this.client
        .from('dining_tables')
        .select('id')
        .eq('label', tableLabel)
        .maybeSingle();
      if (t) tableId = t.id;
    }

    // Check table occupancy for dine-in
    if (input.orderType === 'dine-in' && (tableId || tableLabel)) {
      const { data: existingActive } = await this.client
        .from('orders')
        .select('id, order_number')
        .or(`table_id.eq.${tableId || '00000000-0000-0000-0000-000000000000'},table_label.eq.${tableLabel || ''}`)
        .in('status', ['placed', 'accepted', 'preparing', 'ready'])
        .limit(1);

      if (existingActive && existingActive.length > 0) {
        const err: any = new Error(`${tableLabel || 'This table'} is currently occupied with active Order #${existingActive[0].order_number}. Please select another table.`);
        err.code = 'TABLE_OCCUPIED';
        err.status = 409;
        throw err;
      }
    }
    const itemIds = input.items.map((i) => i.menuItemId);
    const { data: menuItems, error: menuErr } = await this.client
      .from('menu_items')
      .select('*')
      .in('id', itemIds)
      .eq('is_available', true);

    if (menuErr) throw menuErr;

    const menuMap = new Map((menuItems || []).map((m: any) => [m.id, m]));
    let subtotalPaise = 0;
    const resolvedItems: any[] = [];

    for (const item of input.items) {
      const mi = menuMap.get(item.menuItemId);
      if (!mi) {
        const err: any = new Error(`Item ${item.menuItemId} is unavailable`);
        err.code = 'ITEM_UNAVAILABLE';
        err.status = 422;
        throw err;
      }
      const lineTotal = mi.price_paise * item.quantity;
      subtotalPaise += lineTotal;
      resolvedItems.push({
        menu_item_id: mi.id,
        item_name_snapshot: mi.name,
        unit_price_paise: mi.price_paise,
        quantity: item.quantity,
        line_total_paise: lineTotal,
        item_note: item.itemNote || null
      });
    }

    const taxPaise = settings.tax_enabled
      ? Math.round((subtotalPaise * settings.tax_rate_basis_points) / 10000)
      : 0;
    const totalPaise = subtotalPaise + taxPaise;

    const orderPayload: any = {
      table_id: tableId,
      order_type: input.orderType || 'dine-in',
      status: 'placed',
      payment_status: 'unpaid',
      currency: 'INR',
      subtotal_paise: subtotalPaise,
      tax_paise: taxPaise,
      discount_paise: 0,
      total_paise: totalPaise,
      customer_note: input.customerNote || null,
      customer_acknowledged_edits: true,
      version: 1
    };

    if (tableLabel) {
      orderPayload.table_label = tableLabel;
    }

    let { data: order, error: orderErr } = await this.client
      .from('orders')
      .insert(orderPayload)
      .select('*')
      .single();

    // Gracefully handle if table_label column does not exist yet in Supabase schema cache
    if (orderErr && (orderErr.message.includes('table_label') || (orderErr as any).code === 'PGRST204')) {
      delete orderPayload.table_label;
      const retryResult = await this.client
        .from('orders')
        .insert(orderPayload)
        .select('*')
        .single();
      order = retryResult.data;
      orderErr = retryResult.error;
    }

    if (orderErr) throw orderErr;

    const itemsToInsert = resolvedItems.map((ri) => ({
      ...ri,
      order_id: order.id
    }));

    const { error: itemsErr } = await this.client.from('order_items').insert(itemsToInsert);
    if (itemsErr) throw itemsErr;

    await this.client.from('order_audit_logs').insert({
      order_id: order.id,
      actor_name: 'Customer',
      action: 'order_placed',
      after_data: { totalPaise, itemCount: resolvedItems.length }
    });

    return (await this.getOrderById(order.id))!;
  }

  async getOrderById(orderId: string): Promise<Order | null> {
    const { data: order, error: orderErr } = await this.client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) return null;

    const { data: items } = await this.client
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    return {
      ...order,
      items: items || []
    };
  }

  async getOrders(filters?: { status?: string; paymentStatus?: string; limit?: number }): Promise<Order[]> {
    let query = this.client.from('orders').select('*');

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);
    query = query.order('created_at', { ascending: false });
    if (filters?.limit) query = query.limit(filters.limit);

    const { data, error } = await query;
    if (error) throw error;

    const orders: Order[] = [];
    for (const ord of data || []) {
      const { data: items } = await this.client
        .from('order_items')
        .select('*')
        .eq('order_id', ord.id)
        .order('created_at', { ascending: true });

      orders.push({
        ...ord,
        items: items || []
      });
    }

    return orders;
  }

  async updateOrderItems(input: UpdateOrderItemsInput): Promise<Order> {
    const existing = await this.getOrderById(input.orderId);
    if (!existing) {
      const err: any = new Error('Order not found');
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (existing.version !== input.expectedVersion) {
      const err: any = new Error('Order version conflict');
      err.code = 'ORDER_VERSION_CONFLICT';
      err.status = 409;
      throw err;
    }

    const settings = await this.getShopSettings();
    let subtotalPaise = 0;
    const newItems: any[] = [];

    if (input.items) {
      const itemIds = input.items.map((i) => i.menuItemId);
      const { data: menuItems } = await this.client.from('menu_items').select('*').in('id', itemIds);
      const menuMap = new Map((menuItems || []).map((m: any) => [m.id, m]));

      for (const item of input.items) {
        const mi = menuMap.get(item.menuItemId);
        if (!mi) continue;
        const lineTotal = mi.price_paise * item.quantity;
        subtotalPaise += lineTotal;
        newItems.push({
          order_id: input.orderId,
          menu_item_id: mi.id,
          item_name_snapshot: mi.name,
          unit_price_paise: mi.price_paise,
          quantity: item.quantity,
          line_total_paise: lineTotal,
          item_note: item.itemNote || null
        });
      }

      await this.client.from('order_items').delete().eq('order_id', input.orderId);
      await this.client.from('order_items').insert(newItems);
    }

    const taxPaise = settings.tax_enabled
      ? Math.round((subtotalPaise * settings.tax_rate_basis_points) / 10000)
      : 0;
    const totalPaise = subtotalPaise + taxPaise;
    const customerAcknowledged = totalPaise === existing.total_paise;

    await this.client
      .from('orders')
      .update({
        subtotal_paise: subtotalPaise,
        tax_paise: taxPaise,
        total_paise: totalPaise,
        manager_note: input.managerNote !== undefined ? input.managerNote : existing.manager_note,
        customer_acknowledged_edits: customerAcknowledged,
        version: existing.version + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', input.orderId)
      .eq('version', existing.version);

    await this.client.from('order_audit_logs').insert({
      order_id: input.orderId,
      actor_name: input.actorName || 'Manager',
      action: 'order_edited',
      after_data: { totalPaise, version: existing.version + 1 }
    });

    return (await this.getOrderById(input.orderId))!;
  }

  async updateOrderStatus(
    orderId: string,
    expectedVersion: number,
    newStatus: OrderStatus,
    reason?: string | null,
    actorId?: string | null,
    actorName?: string | null
  ): Promise<Order> {
    const existing = await this.getOrderById(orderId);
    if (!existing) {
      const err: any = new Error('Order not found');
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (existing.version !== expectedVersion) {
      const err: any = new Error('Order version conflict');
      err.code = 'ORDER_VERSION_CONFLICT';
      err.status = 409;
      throw err;
    }

    await this.client
      .from('orders')
      .update({
        status: newStatus,
        version: existing.version + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .eq('version', existing.version);

    await this.client.from('order_audit_logs').insert({
      order_id: orderId,
      actor_id: actorId || null,
      actor_name: actorName || 'Manager',
      action: 'status_changed',
      after_data: { status: newStatus },
      reason: reason || null
    });

    return (await this.getOrderById(orderId))!;
  }

  async acknowledgeOrderEdits(orderId: string): Promise<Order> {
    await this.client
      .from('orders')
      .update({
        customer_acknowledged_edits: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    return (await this.getOrderById(orderId))!;
  }

  async createPaymentAttempt(
    orderId: string,
    provider: PaymentProvider,
    providerOrderId?: string | null
  ): Promise<Payment> {
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error('Order not found');

    const { data: payment, error } = await this.client
      .from('payments')
      .insert({
        order_id: orderId,
        provider,
        provider_order_id: providerOrderId || `order_${order.order_number}_${Date.now()}`,
        amount_paise: order.total_paise,
        currency: order.currency,
        status: 'created'
      })
      .select('*')
      .single();

    if (error) throw error;
    return payment as Payment;
  }

  async confirmPayment(
    orderId: string,
    paymentId: string,
    providerPaymentId: string,
    verifiedByRole = 'server',
    actorId?: string | null
  ): Promise<{ order: Order; payment: Payment }> {
    const { data: payment, error: pErr } = await this.client
      .from('payments')
      .update({
        status: 'succeeded',
        provider_payment_id: providerPaymentId,
        verified_at: new Date().toISOString()
      })
      .eq('id', paymentId)
      .select('*')
      .single();

    if (pErr) throw pErr;

    await this.client
      .from('orders')
      .update({
        payment_status: 'paid',
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    await this.client.from('order_audit_logs').insert({
      order_id: orderId,
      actor_id: actorId || null,
      actor_name: verifiedByRole,
      action: 'payment_verified',
      after_data: { paymentId, providerPaymentId }
    });

    const order = (await this.getOrderById(orderId))!;

    // Release table session if no unpaid orders remain for this table
    if (order.table_label) {
      const { data: unpaid } = await this.client
        .from('orders')
        .select('id')
        .eq('table_label', order.table_label)
        .neq('id', orderId)
        .in('status', ['placed', 'accepted', 'preparing', 'ready'])
        .neq('payment_status', 'paid');

      if (!unpaid || unpaid.length === 0) {
        await this.completeTableSession(order.table_label);
      }
    }

    return { order, payment: payment as Payment };
  }

  async recordManualPayment(
    orderId: string,
    expectedVersion: number,
    method: 'cash' | 'manual_upi',
    reference?: string | null,
    note?: string | null,
    actorId?: string | null,
    actorName?: string | null
  ): Promise<{ order: Order; payment: Payment }> {
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error('Order not found');

    const { data: payment, error: pErr } = await this.client
      .from('payments')
      .insert({
        order_id: orderId,
        provider: method,
        provider_payment_id: reference || `manual_${Date.now()}`,
        amount_paise: order.total_paise,
        currency: order.currency,
        status: 'succeeded',
        verified_at: new Date().toISOString(),
        created_by: actorId || null
      })
      .select('*')
      .single();

    if (pErr) throw pErr;

    await this.client
      .from('orders')
      .update({
        payment_status: 'paid',
        status: 'completed',
        completed_at: new Date().toISOString(),
        version: order.version + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .eq('version', expectedVersion);

    await this.client.from('order_audit_logs').insert({
      order_id: orderId,
      actor_id: actorId || null,
      actor_name: actorName || 'Manager',
      action: 'manual_payment_recorded',
      after_data: { method, reference, note }
    });

    const updatedOrder = (await this.getOrderById(orderId))!;

    // Release table session if no unpaid orders remain for this table
    if (order.table_label) {
      const { data: unpaid } = await this.client
        .from('orders')
        .select('id')
        .eq('table_label', order.table_label)
        .neq('id', orderId)
        .in('status', ['placed', 'accepted', 'preparing', 'ready'])
        .neq('payment_status', 'paid');

      if (!unpaid || unpaid.length === 0) {
        await this.completeTableSession(order.table_label);
      }
    }

    return { order: updatedOrder, payment: payment as Payment };
  }

  async getAuditLogs(orderId: string): Promise<OrderAuditLog[]> {
    const { data, error } = await this.client
      .from('order_audit_logs')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as OrderAuditLog[];
  }

  async getAllPayments(): Promise<Payment[]> {
    const { data, error } = await this.client
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data as Payment[];
  }

  async requestPaymentVerification(
    orderId: string,
    utrReference?: string | null
  ): Promise<{ order: Order; payment: Payment }> {
    const order = await this.getOrderById(orderId);
    if (!order) {
      const err: any = new Error('Order not found');
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (order.payment_status === 'paid') {
      const err: any = new Error('Order is already marked as paid.');
      err.code = 'ORDER_ALREADY_PAID';
      err.status = 422;
      throw err;
    }

    const provOrderId = utrReference ? `utr_${utrReference}` : `upi_claim_${Date.now()}`;
    const { data: payment, error: pErr } = await this.client
      .from('payments')
      .insert({
        order_id: orderId,
        provider: 'manual_upi',
        provider_order_id: provOrderId,
        amount_paise: order.total_paise,
        currency: order.currency,
        status: 'pending'
      })
      .select()
      .single();

    if (pErr) throw pErr;

    const { data: updatedOrder, error: oErr } = await this.client
      .from('orders')
      .update({
        payment_status: 'awaiting_verification',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (oErr) throw oErr;

    return { order: updatedOrder as Order, payment: payment as Payment };
  }

  async createMenuItem(input: {
    categoryId: string;
    name: string;
    description?: string | null;
    pricePaise: number;
    imagePath?: string | null;
    isAvailable?: boolean;
    sortOrder?: number;
  }): Promise<MenuItem> {
    const { data, error } = await this.client
      .from('menu_items')
      .insert({
        category_id: input.categoryId,
        name: input.name,
        description: input.description || null,
        price_paise: input.pricePaise,
        image_path: input.imagePath || null,
        is_available: input.isAvailable !== undefined ? input.isAvailable : true,
        sort_order: input.sortOrder !== undefined ? input.sortOrder : 0
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as MenuItem;
  }

  async updateMenuItem(
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
  ): Promise<MenuItem> {
    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (input.categoryId !== undefined) updatePayload.category_id = input.categoryId;
    if (input.name !== undefined) updatePayload.name = input.name;
    if (input.description !== undefined) updatePayload.description = input.description;
    if (input.pricePaise !== undefined) updatePayload.price_paise = input.pricePaise;
    if (input.imagePath !== undefined) updatePayload.image_path = input.imagePath;
    if (input.isAvailable !== undefined) updatePayload.is_available = input.isAvailable;
    if (input.sortOrder !== undefined) updatePayload.sort_order = input.sortOrder;

    const { data, error } = await this.client
      .from('menu_items')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as MenuItem;
  }

  async setMenuItemAvailability(id: string, isAvailable: boolean): Promise<MenuItem> {
    return this.updateMenuItem(id, { isAvailable });
  }

  async deleteMenuItem(id: string): Promise<boolean> {
    // Soft delete to protect historical order records
    const { error } = await this.client
      .from('menu_items')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  async createTableSession(tableLabel: string, phone: string): Promise<{ id: string; tableLabel: string; customerPhone: string; status: string }> {
    // Always complete any existing active session before creating a new one.
    // A new OTP verification always starts a fresh dining session.
    await this.completeTableSession(tableLabel);

    const { data, error } = await this.client
      .from('table_sessions')
      .insert({
        table_label: tableLabel,
        customer_phone: phone,
        status: 'active'
      })
      .select('*')
      .single();

    if (error) {
      return {
        id: `sess_${Date.now()}`,
        tableLabel,
        customerPhone: phone,
        status: 'active'
      };
    }

    return {
      id: data.id,
      tableLabel: data.table_label,
      customerPhone: data.customer_phone,
      status: data.status
    };
  }

  async getActiveTableSession(tableLabel: string): Promise<{ id: string; tableLabel: string; customerPhone: string; status: string } | null> {
    try {
      const { data, error } = await this.client
        .from('table_sessions')
        .select('*')
        .eq('table_label', tableLabel)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      return {
        id: data.id,
        tableLabel: data.table_label,
        customerPhone: data.customer_phone,
        status: data.status
      };
    } catch {
      return null;
    }
  }

  async completeTableSession(tableLabel: string): Promise<void> {
    try {
      await this.client
        .from('table_sessions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('table_label', tableLabel)
        .eq('status', 'active');
    } catch {
      // Ignore error if table not configured
    }
  }

  async isTableSessionActive(sessionId: string, tableLabel: string): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('table_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('table_label', tableLabel)
        .eq('status', 'active')
        .maybeSingle();

      if (error || !data) return false;
      return true;
    } catch {
      return true;
    }
  }
}

