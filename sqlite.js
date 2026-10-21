"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLiteDatabase = void 0;
const node_sqlite_1 = require("node:sqlite");
const uuid_1 = require("uuid");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
class SQLiteDatabase {
    db;
    dbPath;
    constructor(dbPath) {
        if (dbPath) {
            this.dbPath = dbPath;
            if (dbPath !== ':memory:') {
                const dir = node_path_1.default.dirname(dbPath);
                if (!node_fs_1.default.existsSync(dir)) {
                    node_fs_1.default.mkdirSync(dir, { recursive: true });
                }
            }
        }
        else {
            const dir = node_path_1.default.resolve(process.cwd(), '.data');
            if (!node_fs_1.default.existsSync(dir)) {
                node_fs_1.default.mkdirSync(dir, { recursive: true });
            }
            this.dbPath = node_path_1.default.join(dir, 'nasto_house.sqlite');
        }
    }
    async init() {
        this.db = new node_sqlite_1.DatabaseSync(this.dbPath);
        this.db.exec('PRAGMA foreign_keys = ON;');
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.createTables();
        // Safe column migrations for existing SQLite databases
        try {
            this.db.exec('ALTER TABLE shop_settings ADD COLUMN is_open INTEGER NOT NULL DEFAULT 1;');
        }
        catch { }
        try {
            this.db.exec("ALTER TABLE shop_settings ADD COLUMN merchant_upi_id TEXT DEFAULT 'paramumretiya@oksbi';");
        }
        catch { }
        try {
            this.db.exec("ALTER TABLE shop_settings ADD COLUMN merchant_name TEXT DEFAULT 'Param Umretiya';");
        }
        catch { }
        try {
            this.db.exec('ALTER TABLE orders ADD COLUMN completed_at TEXT;');
        }
        catch { }
        try {
            this.db.exec('ALTER TABLE orders ADD COLUMN table_label TEXT;');
        }
        catch { }
        try {
            this.db.exec('ALTER TABLE menu_items ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;');
        }
        catch { }
        this.seedDefaultData();
    }
    createTables() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS dining_tables (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL UNIQUE,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS menu_items (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
        image_path TEXT,
        is_available INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS shop_settings (
        id TEXT PRIMARY KEY,
        shop_name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        tax_enabled INTEGER NOT NULL DEFAULT 0,
        tax_rate_basis_points INTEGER NOT NULL DEFAULT 0,
        is_open INTEGER NOT NULL DEFAULT 1,
        merchant_upi_id TEXT DEFAULT 'paramumretiya@oksbi',
        merchant_name TEXT DEFAULT 'Param Umretiya',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number INTEGER UNIQUE,
        customer_id TEXT,
        table_id TEXT REFERENCES dining_tables(id) ON DELETE SET NULL,
        table_label TEXT,
        order_type TEXT NOT NULL DEFAULT 'dine-in',
        status TEXT NOT NULL DEFAULT 'placed',
        payment_status TEXT NOT NULL DEFAULT 'unpaid',
        currency TEXT NOT NULL DEFAULT 'INR',
        subtotal_paise INTEGER NOT NULL DEFAULT 0,
        tax_paise INTEGER NOT NULL DEFAULT 0,
        discount_paise INTEGER NOT NULL DEFAULT 0,
        total_paise INTEGER NOT NULL DEFAULT 0,
        customer_note TEXT,
        manager_note TEXT,
        customer_acknowledged_edits INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        menu_item_id TEXT REFERENCES menu_items(id) ON DELETE SET NULL,
        item_name_snapshot TEXT NOT NULL,
        unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        line_total_paise INTEGER NOT NULL CHECK (line_total_paise >= 0),
        item_note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_order_id TEXT UNIQUE,
        provider_payment_id TEXT UNIQUE,
        amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL,
        verified_at TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS order_audit_logs (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        actor_id TEXT,
        actor_name TEXT,
        action TEXT NOT NULL,
        before_data TEXT,
        after_data TEXT,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS table_sessions (
        id TEXT PRIMARY KEY,
        table_label TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_orders_table_lookup ON orders(table_id, table_label, status, payment_status);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_table_sessions_lookup ON table_sessions(table_label, status);
      CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id, status);
    `);
    }
    seedDefaultData() {
        // Ensure exactly 10 restaurant tables exist (Table 1 through Table 10)
        for (let i = 1; i <= 10; i++) {
            const hex = i.toString().padStart(12, '0');
            const id = `d0000000-0000-0000-0000-${hex}`;
            const label = `Table ${i}`;
            this.db.prepare(`
        INSERT INTO dining_tables (id, label, is_active) VALUES (?, ?, 1)
        ON CONFLICT(label) DO UPDATE SET is_active = 1
      `).run(id, label);
        }
        const catCountRow = this.db.prepare('SELECT COUNT(*) as count FROM categories').get();
        if (catCountRow.count === 0) {
            const insertCat = this.db.prepare('INSERT INTO categories (id, name, sort_order, is_active) VALUES (?, ?, ?, ?)');
            insertCat.run('c0000001-0000-0000-0000-000000000001', 'Traditional Nasto & Combos', 1, 1);
            insertCat.run('c0000002-0000-0000-0000-000000000002', 'Steamed & Healthy Farsan', 2, 1);
            insertCat.run('c0000003-0000-0000-0000-000000000003', 'Crispy Bites & Kachoris', 3, 1);
            insertCat.run('c0000004-0000-0000-0000-000000000004', 'Hot Beverages & Refreshers', 4, 1);
            insertCat.run('c0000005-0000-0000-0000-000000000005', 'Sweet Treats & Jalebi', 5, 1);
            const insertItem = this.db.prepare(`
        INSERT INTO menu_items (id, category_id, name, description, price_paise, image_path, is_available, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
            // 1. Traditional Nasto & Combos
            insertItem.run('b0000001-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001', 'Jalebi Fafda Special Combo', 'Crispy besan fafda (150g) paired with hot saffron jalebis (100g), spicy raw papaya sambharo & tangy besan kadhi.', 15000, '/images/fafda-jalebi.jpg', 1, 1);
            insertItem.run('b0000002-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001', 'Methi Thepla Plate (4 Pcs)', 'Fresh fenugreek flatbreads pan-roasted in pure ghee, served with sweet mango chundo, green chillies & fresh curd.', 9000, '/images/thepla.jpg', 1, 2);
            insertItem.run('b0000003-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001', 'Sev Khamani Royal', 'Crushed steamed chana dal tempered with mustard, sesame & chillies, generously topped with ratlami sev & fresh pomegranate seeds.', 8500, '/images/sev-khamani.jpg', 1, 3);
            // 2. Steamed & Healthy Farsan
            insertItem.run('b0000004-0000-0000-0000-000000000002', 'c0000002-0000-0000-0000-000000000002', 'Nylon Khaman Spongy (Plate)', 'Ultra-soft, melt-in-mouth steamed savoury cake tempered with mustard seeds, curry leaves, hing and green chillies.', 6000, '/images/khaman.jpg', 1, 1);
            insertItem.run('b0000005-0000-0000-0000-000000000002', 'c0000002-0000-0000-0000-000000000002', 'Silky Khandvi Rolls', 'Delicate spiced gram flour & buttermilk rolls garnished with freshly grated coconut, coriander and black mustard seeds.', 7000, '/images/khandvi.jpg', 1, 2);
            insertItem.run('b0000006-0000-0000-0000-000000000002', 'c0000002-0000-0000-0000-000000000002', 'White Khatta Dhokla', 'Fermented rice and urad dal steamed cakes dusted with crushed black pepper and roasted cumin.', 6500, '/images/dhokla.jpg', 1, 3);
            // 3. Crispy Bites & Kachoris
            insertItem.run('b0000007-0000-0000-0000-000000000003', 'c0000003-0000-0000-0000-000000000003', 'Lilva Kachori (3 Pcs)', 'Crisp golden flaky pastry filled with winter fresh green tuvar (pigeon peas) seasoned with ginger, clove & cinnamon.', 7500, '/images/lilva-kachori.jpg', 1, 1);
            insertItem.run('b0000008-0000-0000-0000-000000000003', 'c0000003-0000-0000-0000-000000000003', 'Punjabi Samosa (2 Pcs)', 'Flaky crust stuffed with cumin-coriander spiced potatoes, green peas and cashews, served with mint & date-tamarind chutney.', 5000, '/images/samosa.jpg', 1, 2);
            insertItem.run('b0000009-0000-0000-0000-000000000003', 'c0000003-0000-0000-0000-000000000003', 'Dal Vada Plate with Fried Chillies', 'Crunchy fried yellow moong dal fritters served smoking hot with fresh onion rings and fried salted green chillies.', 8000, '/images/dal-vada.jpg', 1, 3);
            // 4. Hot Beverages & Refreshers
            insertItem.run('b0000010-0000-0000-0000-000000000004', 'c0000004-0000-0000-0000-000000000004', 'Adrak Elaichi Special Chai (Kullad)', 'Simmered whole milk tea with fresh crushed ginger root, green cardamom pods and special aromatic tea masala.', 3000, '/images/chai.jpg', 1, 1);
            insertItem.run('b0000011-0000-0000-0000-000000000004', 'c0000004-0000-0000-0000-000000000004', 'Masala Chaas (Spiced Buttermilk)', 'Refreshing churned yoghurt drink infused with roasted cumin powder, black salt, fresh mint, and coriander.', 2500, '/images/chaas.jpg', 1, 2);
            insertItem.run('b0000012-0000-0000-0000-000000000004', 'c0000004-0000-0000-0000-000000000004', 'Madras Filter Coffee', 'Rich, frothy decoction brewed with dark roasted chicory coffee beans and steaming hot frothed milk.', 4000, '/images/coffee.jpg', 1, 3);
            // 5. Sweet Treats & Jalebi
            insertItem.run('b0000013-0000-0000-0000-000000000005', 'c0000005-0000-0000-0000-000000000005', 'Pure Ghee Kesari Jalebi (100g)', 'Freshly fried spiral jalebis soaked in saffron sugar syrup with cardamom and pistachio slivers.', 7000, '/images/jalebi.jpg', 1, 1);
            insertItem.run('b0000014-0000-0000-0000-000000000005', 'c0000005-0000-0000-0000-000000000005', 'Traditional Mohanthal (100g)', 'Royal Gujarati sweet made from coarse besan roasted in pure cow ghee, flavored with saffron, mace and slivered almonds.', 9500, '/images/mohanthal.jpg', 1, 2);
        }
        const settingsCount = this.db.prepare('SELECT COUNT(*) as count FROM shop_settings').get();
        if (settingsCount.count === 0) {
            const insertSettings = this.db.prepare(`
        INSERT INTO shop_settings (id, shop_name, currency, tax_enabled, tax_rate_basis_points)
        VALUES (?, ?, ?, ?, ?)
      `);
            insertSettings.run('f0000001-0000-0000-0000-000000000001', 'Nasto House Authentic Farsan & Sweets', 'INR', 1, 500);
        }
    }
    async getMenu() {
        const categories = this.db
            .prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC')
            .all();
        const items = this.db
            .prepare('SELECT * FROM menu_items WHERE (is_active IS NULL OR is_active = 1) ORDER BY sort_order ASC')
            .all();
        return {
            categories: categories.map((c) => ({
                ...c,
                is_active: Boolean(c.is_active)
            })),
            items: items.map((i) => ({
                ...i,
                is_available: Boolean(i.is_available),
                is_active: Boolean(i.is_active !== undefined ? i.is_active : 1)
            }))
        };
    }
    async getDiningTables() {
        // Select all active restaurant tables (Table 1 through Table 10) ordered numerically
        const tables = this.db
            .prepare(`
        SELECT * FROM dining_tables 
        WHERE is_active = 1 
        ORDER BY CASE 
          WHEN label LIKE 'Table %' THEN CAST(SUBSTR(label, 7) AS INTEGER) 
          ELSE 999 
        END ASC
      `)
            .all();
        const result = [];
        for (const t of tables) {
            const activeRows = this.db
                .prepare(`
          SELECT * FROM orders 
          WHERE (table_id = ? OR table_label = ?) 
            AND status IN ('placed', 'accepted', 'preparing', 'ready')
            AND payment_status != 'paid'
          ORDER BY created_at DESC
        `)
                .all(t.id, t.label);
            const activeOrders = [];
            for (const ord of activeRows) {
                const items = this.db
                    .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC')
                    .all(ord.id);
                activeOrders.push({
                    ...ord,
                    customer_acknowledged_edits: Boolean(ord.customer_acknowledged_edits),
                    items
                });
            }
            result.push({
                ...t,
                is_active: Boolean(t.is_active),
                is_occupied: activeOrders.length > 0,
                active_orders: activeOrders
            });
        }
        return result;
    }
    async getShopSettings() {
        const settings = this.db.prepare('SELECT * FROM shop_settings LIMIT 1').get();
        if (!settings) {
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
            ...settings,
            tax_enabled: Boolean(settings.tax_enabled),
            is_open: settings.is_open !== undefined ? Boolean(settings.is_open) : true,
            merchant_upi_id: settings.merchant_upi_id || 'paramumretiya@oksbi',
            merchant_name: settings.merchant_name || 'Param Umretiya'
        };
    }
    async setShopOpen(isOpen) {
        this.db.prepare(`
      UPDATE shop_settings SET is_open = ?, updated_at = datetime('now')
    `).run(isOpen ? 1 : 0);
        return await this.getShopSettings();
    }
    async getDashboardStats() {
        const settings = await this.getShopSettings();
        // Asia/Kolkata date boundary (+5 hours 30 mins)
        const runningOrdersCountRow = this.db.prepare(`
      SELECT COUNT(*) as count FROM orders 
      WHERE status IN ('placed', 'accepted', 'preparing', 'ready')
    `).get();
        const todayCompletedRow = this.db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_paise), 0) as totalValue 
      FROM orders 
      WHERE status = 'completed' 
        AND date(COALESCE(completed_at, updated_at), '+5 hours', '30 minutes') = date('now', '+5 hours', '30 minutes')
    `).get();
        const todayVerifiedRevenueRow = this.db.prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) as verifiedRevenue 
      FROM payments 
      WHERE status = 'succeeded' 
        AND date(COALESCE(verified_at, created_at), '+5 hours', '30 minutes') = date('now', '+5 hours', '30 minutes')
    `).get();
        const ordersAwaitingPaymentRow = this.db.prepare(`
      SELECT COUNT(*) as count FROM orders 
      WHERE status != 'cancelled' AND payment_status != 'paid'
    `).get();
        const tables = await this.getDiningTables();
        const occupiedTablesCount = tables.filter((t) => t.is_occupied).length;
        const availableTablesCount = Math.max(0, 10 - occupiedTablesCount);
        const recentActiveOrders = await this.getOrders({ status: undefined, limit: 50 });
        const runningOrders = recentActiveOrders.filter((o) => ['placed', 'accepted', 'preparing', 'ready'].includes(o.status));
        const todayCompletedOrders = recentActiveOrders.filter((o) => o.status === 'completed');
        return {
            runningOrdersCount: runningOrdersCountRow.count,
            todayCompletedOrdersCount: todayCompletedRow.count,
            todayVerifiedRevenuePaise: todayVerifiedRevenueRow.verifiedRevenue,
            todayCompletedOrdersValuePaise: todayCompletedRow.totalValue,
            ordersAwaitingPaymentCount: ordersAwaitingPaymentRow.count,
            occupiedTablesCount,
            availableTablesCount,
            isShopOpen: settings.is_open,
            recentActiveOrders: runningOrders,
            todayCompletedOrders
        };
    }
    async createOrder(input) {
        if (!input.items || input.items.length === 0) {
            const err = new Error('Order must contain at least one item');
            err.code = 'INVALID_ORDER_ITEMS';
            err.status = 400;
            throw err;
        }
        const settings = await this.getShopSettings();
        if (!settings.is_open) {
            const err = new Error("We're currently not accepting new orders. Please check again soon.");
            err.code = 'SHOP_CLOSED';
            err.status = 422;
            throw err;
        }
        // Resolve table label if provided
        let tableLabel = input.tableLabel || null;
        let tableId = input.tableId || null;
        if (tableId && !tableLabel) {
            const t = this.db.prepare('SELECT label FROM dining_tables WHERE id = ?').get(tableId);
            if (t)
                tableLabel = t.label;
        }
        else if (tableLabel && !tableId) {
            const t = this.db.prepare('SELECT id FROM dining_tables WHERE label = ?').get(tableLabel);
            if (t)
                tableId = t.id;
        }
        // Prevent duplicate active orders on the same dining table
        if (input.orderType === 'dine-in' && (tableId || tableLabel)) {
            const activeOrder = this.db.prepare(`
        SELECT id, order_number FROM orders 
        WHERE (table_id = ? OR table_label = ?) 
          AND status IN ('placed', 'accepted', 'preparing', 'ready')
          AND payment_status != 'paid'
        LIMIT 1
      `).get(tableId || '', tableLabel || '');
            if (activeOrder) {
                const err = new Error(`${tableLabel || 'This table'} is currently occupied with active Order #${activeOrder.order_number}. Please select another table.`);
                err.code = 'TABLE_OCCUPIED';
                err.status = 409;
                throw err;
            }
        }
        const orderId = (0, uuid_1.v4)();
        // Fetch and validate items and compute authoritative prices
        const itemIds = input.items.map((i) => i.menuItemId);
        const placeholders = itemIds.map(() => '?').join(',');
        const menuRows = this.db
            .prepare(`SELECT * FROM menu_items WHERE id IN (${placeholders}) AND is_available = 1`)
            .all(...itemIds);
        const menuMap = new Map(menuRows.map((m) => [m.id, m]));
        let subtotalPaise = 0;
        const resolvedItems = [];
        for (const item of input.items) {
            if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 50) {
                const err = new Error(`Invalid quantity for item: ${item.quantity}`);
                err.code = 'INVALID_QUANTITY';
                err.status = 400;
                throw err;
            }
            const menuItem = menuMap.get(item.menuItemId);
            if (!menuItem) {
                const err = new Error(`Item ${item.menuItemId} is unavailable or does not exist`);
                err.code = 'ITEM_UNAVAILABLE';
                err.status = 422;
                throw err;
            }
            const lineTotal = menuItem.price_paise * item.quantity;
            subtotalPaise += lineTotal;
            resolvedItems.push({
                id: (0, uuid_1.v4)(),
                menuItemId: menuItem.id,
                name: menuItem.name,
                unitPricePaise: menuItem.price_paise,
                quantity: item.quantity,
                lineTotalPaise: lineTotal,
                itemNote: item.itemNote || null
            });
        }
        // Tax calculation
        const taxPaise = settings.tax_enabled
            ? Math.round((subtotalPaise * settings.tax_rate_basis_points) / 10000)
            : 0;
        const discountPaise = 0;
        const totalPaise = subtotalPaise + taxPaise - discountPaise;
        // Compute next sequential order number starting at 1001
        const maxOrder = this.db.prepare('SELECT MAX(order_number) as maxNum FROM orders').get();
        const nextOrderNumber = (maxOrder?.maxNum || 1000) + 1;
        // Insert order atomically
        const insertOrderStmt = this.db.prepare(`
      INSERT INTO orders (
        id, order_number, customer_id, table_id, table_label, order_type,
        status, payment_status, currency, subtotal_paise,
        tax_paise, discount_paise, total_paise, customer_note,
        customer_acknowledged_edits, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
    `);
        insertOrderStmt.run(orderId, nextOrderNumber, input.customerId || null, tableId, tableLabel, input.orderType || 'dine-in', 'placed', 'unpaid', 'INR', subtotalPaise, taxPaise, discountPaise, totalPaise, input.customerNote || null);
        // Insert line items
        const insertItemStmt = this.db.prepare(`
      INSERT INTO order_items (
        id, order_id, menu_item_id, item_name_snapshot,
        unit_price_paise, quantity, line_total_paise, item_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        for (const r of resolvedItems) {
            insertItemStmt.run(r.id, orderId, r.menuItemId, r.name, r.unitPricePaise, r.quantity, r.lineTotalPaise, r.itemNote ?? null);
        }
        // Insert audit log
        const auditStmt = this.db.prepare(`
      INSERT INTO order_audit_logs (
        id, order_id, actor_id, actor_name, action, before_data, after_data, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        auditStmt.run((0, uuid_1.v4)(), orderId, input.customerId || null, 'Customer', 'order_placed', null, JSON.stringify({ totalPaise, itemCount: resolvedItems.length, orderType: input.orderType || 'dine-in' }), 'Order initially placed by customer');
        return (await this.getOrderById(orderId));
    }
    async getOrderById(orderId) {
        const order = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        if (!order)
            return null;
        const items = this.db
            .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC')
            .all(orderId);
        return {
            ...order,
            customer_acknowledged_edits: Boolean(order.customer_acknowledged_edits),
            items: items.map((i) => ({
                ...i
            }))
        };
    }
    async getOrders(filters) {
        let query = 'SELECT * FROM orders WHERE 1=1';
        const params = [];
        if (filters?.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        }
        if (filters?.paymentStatus) {
            query += ' AND payment_status = ?';
            params.push(filters.paymentStatus);
        }
        query += ' ORDER BY created_at DESC';
        if (filters?.limit) {
            query += ' LIMIT ?';
            params.push(filters.limit);
        }
        const rows = this.db.prepare(query).all(...params);
        const orders = [];
        for (const row of rows) {
            const items = this.db
                .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC')
                .all(row.id);
            orders.push({
                ...row,
                customer_acknowledged_edits: Boolean(row.customer_acknowledged_edits),
                items
            });
        }
        return orders;
    }
    async updateOrderItems(input) {
        const existing = await this.getOrderById(input.orderId);
        if (!existing) {
            const err = new Error('Order not found');
            err.code = 'ORDER_NOT_FOUND';
            err.status = 404;
            throw err;
        }
        // Concurrency check
        if (existing.version !== input.expectedVersion) {
            const err = new Error(`Order version conflict: current version is ${existing.version}, expected ${input.expectedVersion}. Please refresh the order.`);
            err.code = 'ORDER_VERSION_CONFLICT';
            err.status = 409;
            throw err;
        }
        // Business rule: Can only edit if placed or accepted, and not paid
        if (existing.payment_status === 'paid') {
            const err = new Error('Cannot edit an order that is already paid.');
            err.code = 'ORDER_ALREADY_PAID';
            err.status = 422;
            throw err;
        }
        if (existing.status === 'completed' || existing.status === 'cancelled') {
            const err = new Error(`Cannot edit an order with status: ${existing.status}`);
            err.code = 'INVALID_ORDER_STATE';
            err.status = 422;
            throw err;
        }
        const settings = await this.getShopSettings();
        // If items are being updated
        let newSubtotalPaise = existing.subtotal_paise;
        let newTaxPaise = existing.tax_paise;
        let newTotalPaise = existing.total_paise;
        let customerAcknowledged = existing.customer_acknowledged_edits;
        const beforeData = {
            totalPaise: existing.total_paise,
            version: existing.version,
            items: existing.items
        };
        if (input.items && input.items.length > 0) {
            const itemIds = input.items.map((i) => i.menuItemId);
            const placeholders = itemIds.map(() => '?').join(',');
            const menuRows = this.db
                .prepare(`SELECT * FROM menu_items WHERE id IN (${placeholders})`)
                .all(...itemIds);
            const menuMap = new Map(menuRows.map((m) => [m.id, m]));
            newSubtotalPaise = 0;
            const newItems = [];
            for (const item of input.items) {
                if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 50) {
                    const err = new Error(`Invalid item quantity: ${item.quantity}`);
                    err.code = 'INVALID_QUANTITY';
                    err.status = 400;
                    throw err;
                }
                const menuItem = menuMap.get(item.menuItemId);
                if (!menuItem) {
                    const err = new Error(`Item ${item.menuItemId} does not exist`);
                    err.code = 'ITEM_NOT_FOUND';
                    err.status = 422;
                    throw err;
                }
                const lineTotal = menuItem.price_paise * item.quantity;
                newSubtotalPaise += lineTotal;
                newItems.push({
                    id: (0, uuid_1.v4)(),
                    orderId: input.orderId,
                    menuItemId: menuItem.id,
                    name: menuItem.name,
                    unitPricePaise: menuItem.price_paise,
                    quantity: item.quantity,
                    lineTotalPaise: lineTotal,
                    itemNote: item.itemNote || null
                });
            }
            newTaxPaise = settings.tax_enabled
                ? Math.round((newSubtotalPaise * settings.tax_rate_basis_points) / 10000)
                : 0;
            newTotalPaise = newSubtotalPaise + newTaxPaise;
            // If total changed, customer must acknowledge before payment
            if (newTotalPaise !== existing.total_paise) {
                customerAcknowledged = false;
            }
            // Replace order items
            this.db.prepare('DELETE FROM order_items WHERE order_id = ?').run(input.orderId);
            const insertItemStmt = this.db.prepare(`
        INSERT INTO order_items (
          id, order_id, menu_item_id, item_name_snapshot,
          unit_price_paise, quantity, line_total_paise, item_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
            for (const ni of newItems) {
                insertItemStmt.run(ni.id, input.orderId, ni.menuItemId, ni.name, ni.unitPricePaise, ni.quantity, ni.lineTotalPaise, ni.itemNote ?? null);
            }
        }
        const newVersion = existing.version + 1;
        const managerNote = input.managerNote !== undefined ? input.managerNote : existing.manager_note;
        this.db.prepare(`
      UPDATE orders SET
        subtotal_paise = ?,
        tax_paise = ?,
        total_paise = ?,
        manager_note = ?,
        customer_acknowledged_edits = ?,
        version = ?,
        updated_at = datetime('now')
      WHERE id = ? AND version = ?
    `).run(newSubtotalPaise, newTaxPaise, newTotalPaise, managerNote, customerAcknowledged ? 1 : 0, newVersion, input.orderId, existing.version);
        // Audit log
        const afterData = {
            totalPaise: newTotalPaise,
            version: newVersion,
            managerNote
        };
        this.db.prepare(`
      INSERT INTO order_audit_logs (
        id, order_id, actor_id, actor_name, action, before_data, after_data, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run((0, uuid_1.v4)(), input.orderId, input.actorId || null, input.actorName || 'Manager', 'order_edited', JSON.stringify(beforeData), JSON.stringify(afterData), 'Order items/notes revised by manager');
        return (await this.getOrderById(input.orderId));
    }
    async updateOrderStatus(orderId, expectedVersion, newStatus, reason, actorId, actorName) {
        const existing = await this.getOrderById(orderId);
        if (!existing) {
            const err = new Error('Order not found');
            err.code = 'ORDER_NOT_FOUND';
            err.status = 404;
            throw err;
        }
        if (existing.version !== expectedVersion) {
            const err = new Error(`Order version conflict: current version is ${existing.version}, expected ${expectedVersion}. Please refresh the order.`);
            err.code = 'ORDER_VERSION_CONFLICT';
            err.status = 409;
            throw err;
        }
        // Valid state transitions
        const validTransitions = {
            placed: ['accepted', 'cancelled'],
            accepted: ['preparing', 'cancelled'],
            preparing: ['ready', 'cancelled'],
            ready: ['completed'],
            completed: [],
            cancelled: []
        };
        if (!validTransitions[existing.status]?.includes(newStatus)) {
            const err = new Error(`Invalid status transition from '${existing.status}' to '${newStatus}'.`);
            err.code = 'INVALID_STATUS_TRANSITION';
            err.status = 422;
            throw err;
        }
        const newVersion = existing.version + 1;
        this.db.prepare(`
      UPDATE orders SET
        status = ?,
        version = ?,
        updated_at = datetime('now'),
        completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
      WHERE id = ? AND version = ?
    `).run(newStatus, newVersion, newStatus, orderId, existing.version);
        // Audit log
        this.db.prepare(`
      INSERT INTO order_audit_logs (
        id, order_id, actor_id, actor_name, action, before_data, after_data, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run((0, uuid_1.v4)(), orderId, actorId || null, actorName || 'Manager', 'status_changed', JSON.stringify({ status: existing.status }), JSON.stringify({ status: newStatus }), reason || `Status updated from ${existing.status} to ${newStatus}`);
        return (await this.getOrderById(orderId));
    }
    async acknowledgeOrderEdits(orderId) {
        const existing = await this.getOrderById(orderId);
        if (!existing) {
            const err = new Error('Order not found');
            err.code = 'ORDER_NOT_FOUND';
            err.status = 404;
            throw err;
        }
        this.db.prepare(`
      UPDATE orders SET
        customer_acknowledged_edits = 1,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(orderId);
        return (await this.getOrderById(orderId));
    }
    async createPaymentAttempt(orderId, provider, providerOrderId) {
        const order = await this.getOrderById(orderId);
        if (!order) {
            const err = new Error('Order not found');
            err.code = 'ORDER_NOT_FOUND';
            err.status = 404;
            throw err;
        }
        if (!order.customer_acknowledged_edits) {
            const err = new Error('Please review and acknowledge the revised total before proceeding to payment.');
            err.code = 'CUSTOMER_CONFIRMATION_REQUIRED';
            err.status = 422;
            throw err;
        }
        const paymentId = (0, uuid_1.v4)();
        const provOrderId = providerOrderId || `order_${order.order_number}_${Date.now()}`;
        this.db.prepare(`
      INSERT INTO payments (
        id, order_id, provider, provider_order_id, amount_paise,
        currency, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'created', datetime('now'), datetime('now'))
    `).run(paymentId, orderId, provider, provOrderId, order.total_paise, order.currency);
        // Update order payment status to pending if unpaid
        if (order.payment_status === 'unpaid') {
            this.db.prepare(`
        UPDATE orders SET payment_status = 'pending', updated_at = datetime('now') WHERE id = ?
      `).run(orderId);
        }
        return this.db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    }
    async confirmPayment(orderId, paymentId, providerPaymentId, verifiedByRole = 'server', actorId) {
        const order = await this.getOrderById(orderId);
        if (!order) {
            const err = new Error('Order not found');
            err.code = 'ORDER_NOT_FOUND';
            err.status = 404;
            throw err;
        }
        const payment = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
        if (!payment) {
            const err = new Error('Payment record not found');
            err.code = 'PAYMENT_NOT_FOUND';
            err.status = 404;
            throw err;
        }
        this.db.prepare(`
      UPDATE payments SET
        status = 'succeeded',
        provider_payment_id = ?,
        verified_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(providerPaymentId, paymentId);
        this.db.prepare(`
      UPDATE orders SET
        payment_status = 'paid',
        status = 'completed',
        completed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ? AND status != 'cancelled'
    `).run(orderId);
        // Audit log
        this.db.prepare(`
      INSERT INTO order_audit_logs (
        id, order_id, actor_id, actor_name, action, before_data, after_data, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run((0, uuid_1.v4)(), orderId, actorId || null, verifiedByRole, 'payment_verified', JSON.stringify({ paymentStatus: order.payment_status }), JSON.stringify({ paymentStatus: 'paid', paymentId, providerPaymentId }), 'Payment verified successfully');
        const updatedOrder = (await this.getOrderById(orderId));
        const updatedPayment = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
        // Release table session if no unpaid orders remain for this table
        if (order.table_label || order.table_id) {
            const remainingUnpaid = this.db.prepare(`
        SELECT COUNT(*) as count FROM orders
        WHERE (table_id = ? OR table_label = ?)
          AND id != ?
          AND status IN ('placed', 'accepted', 'preparing', 'ready')
          AND payment_status != 'paid'
      `).get(order.table_id || '', order.table_label || '', orderId);
            if (remainingUnpaid.count === 0 && order.table_label) {
                await this.completeTableSession(order.table_label);
            }
        }
        return { order: updatedOrder, payment: updatedPayment };
    }
    async recordManualPayment(orderId, expectedVersion, method, reference, note, actorId, actorName) {
        const order = await this.getOrderById(orderId);
        if (!order) {
            const err = new Error('Order not found');
            err.code = 'ORDER_NOT_FOUND';
            err.status = 404;
            throw err;
        }
        if (order.version !== expectedVersion) {
            const err = new Error(`Order version conflict: current version is ${order.version}, expected ${expectedVersion}. Please refresh.`);
            err.code = 'ORDER_VERSION_CONFLICT';
            err.status = 409;
            throw err;
        }
        if (order.payment_status === 'paid') {
            const err = new Error('Order is already marked as paid.');
            err.code = 'ORDER_ALREADY_PAID';
            err.status = 422;
            throw err;
        }
        const paymentId = (0, uuid_1.v4)();
        const providerPaymentId = reference || `manual_${Date.now()}`;
        this.db.prepare(`
      INSERT INTO payments (
        id, order_id, provider, provider_payment_id, amount_paise,
        currency, status, verified_at, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'succeeded', datetime('now'), ?, datetime('now'), datetime('now'))
    `).run(paymentId, orderId, method, providerPaymentId, order.total_paise, order.currency, actorId || null);
        const newVersion = order.version + 1;
        this.db.prepare(`
      UPDATE orders SET
        payment_status = 'paid',
        status = 'completed',
        completed_at = datetime('now'),
        version = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(newVersion, orderId);
        // Audit log
        this.db.prepare(`
      INSERT INTO order_audit_logs (
        id, order_id, actor_id, actor_name, action, before_data, after_data, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run((0, uuid_1.v4)(), orderId, actorId || null, actorName || 'Manager', 'manual_payment_recorded', JSON.stringify({ paymentStatus: order.payment_status }), JSON.stringify({ paymentStatus: 'paid', method, reference, note }), note || `Manual payment recorded via ${method}`);
        const updatedOrder = (await this.getOrderById(orderId));
        const updatedPayment = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
        // Release table session if no unpaid orders remain for this table
        if (order.table_label || order.table_id) {
            const remainingUnpaid = this.db.prepare(`
        SELECT COUNT(*) as count FROM orders
        WHERE (table_id = ? OR table_label = ?)
          AND id != ?
          AND status IN ('placed', 'accepted', 'preparing', 'ready')
          AND payment_status != 'paid'
      `).get(order.table_id || '', order.table_label || '', orderId);
            if (remainingUnpaid.count === 0 && order.table_label) {
                await this.completeTableSession(order.table_label);
            }
        }
        return { order: updatedOrder, payment: updatedPayment };
    }
    async requestPaymentVerification(orderId, utrReference) {
        const order = await this.getOrderById(orderId);
        if (!order) {
            const err = new Error('Order not found');
            err.code = 'ORDER_NOT_FOUND';
            err.status = 404;
            throw err;
        }
        if (order.payment_status === 'paid') {
            const err = new Error('Order is already marked as paid.');
            err.code = 'ORDER_ALREADY_PAID';
            err.status = 422;
            throw err;
        }
        let payment = this.db
            .prepare('SELECT * FROM payments WHERE order_id = ? AND provider = ? ORDER BY created_at DESC LIMIT 1')
            .get(orderId, 'manual_upi');
        if (!payment) {
            const paymentId = (0, uuid_1.v4)();
            const provOrderId = utrReference ? `utr_${utrReference}` : `upi_claim_${Date.now()}`;
            this.db.prepare(`
        INSERT INTO payments (
          id, order_id, provider, provider_order_id, amount_paise, currency, status, created_at, updated_at
        ) VALUES (?, ?, 'manual_upi', ?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `).run(paymentId, orderId, provOrderId, order.total_paise, order.currency);
            payment = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
        }
        else if (utrReference) {
            this.db.prepare(`
        UPDATE payments SET provider_order_id = ?, updated_at = datetime('now') WHERE id = ?
      `).run(`utr_${utrReference}`, payment.id);
            payment = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id);
        }
        this.db.prepare(`
      UPDATE orders SET payment_status = 'awaiting_verification', updated_at = datetime('now') WHERE id = ?
    `).run(orderId);
        this.db.prepare(`
      INSERT INTO order_audit_logs (
        id, order_id, actor_name, action, before_data, after_data, reason
      ) VALUES (?, ?, 'Customer', 'payment_submitted', ?, ?, 'Customer submitted UPI payment for verification')
    `).run((0, uuid_1.v4)(), orderId, JSON.stringify({ paymentStatus: order.payment_status }), JSON.stringify({ paymentStatus: 'awaiting_verification', utrReference }));
        const updatedOrder = (await this.getOrderById(orderId));
        return { order: updatedOrder, payment };
    }
    async getAuditLogs(orderId) {
        const logs = this.db
            .prepare('SELECT * FROM order_audit_logs WHERE order_id = ? ORDER BY created_at DESC')
            .all(orderId);
        return logs.map((l) => ({
            ...l,
            before_data: l.before_data ? JSON.parse(l.before_data) : null,
            after_data: l.after_data ? JSON.parse(l.after_data) : null
        }));
    }
    async getAllPayments() {
        const payments = this.db
            .prepare('SELECT * FROM payments ORDER BY created_at DESC LIMIT 100')
            .all();
        return payments;
    }
    async createMenuItem(input) {
        const id = (0, uuid_1.v4)();
        const isAvailable = input.isAvailable !== undefined ? (input.isAvailable ? 1 : 0) : 1;
        const sortOrder = input.sortOrder !== undefined ? input.sortOrder : 0;
        this.db.prepare(`
      INSERT INTO menu_items (
        id, category_id, name, description, price_paise, image_path, is_available, is_active, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
    `).run(id, input.categoryId, input.name, input.description || null, input.pricePaise, input.imagePath || null, isAvailable, sortOrder);
        const row = this.db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
        return {
            ...row,
            is_available: Boolean(row.is_available),
            is_active: Boolean(row.is_active)
        };
    }
    async updateMenuItem(id, input) {
        const existing = this.db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
        if (!existing) {
            const err = new Error('Menu item not found');
            err.code = 'NOT_FOUND';
            err.status = 404;
            throw err;
        }
        const categoryId = input.categoryId !== undefined ? input.categoryId : existing.category_id;
        const name = input.name !== undefined ? input.name : existing.name;
        const description = input.description !== undefined ? input.description : existing.description;
        const pricePaise = input.pricePaise !== undefined ? input.pricePaise : existing.price_paise;
        const imagePath = input.imagePath !== undefined ? input.imagePath : existing.image_path;
        const isAvailable = input.isAvailable !== undefined ? (input.isAvailable ? 1 : 0) : existing.is_available;
        const sortOrder = input.sortOrder !== undefined ? input.sortOrder : existing.sort_order;
        this.db.prepare(`
      UPDATE menu_items SET
        category_id = ?,
        name = ?,
        description = ?,
        price_paise = ?,
        image_path = ?,
        is_available = ?,
        sort_order = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(categoryId, name, description, pricePaise, imagePath, isAvailable, sortOrder, id);
        const row = this.db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
        return {
            ...row,
            is_available: Boolean(row.is_available),
            is_active: Boolean(row.is_active)
        };
    }
    async setMenuItemAvailability(id, isAvailable) {
        return this.updateMenuItem(id, { isAvailable });
    }
    async deleteMenuItem(id) {
        this.db.prepare(`
      UPDATE menu_items SET is_active = 0, updated_at = datetime('now') WHERE id = ?
    `).run(id);
        return true;
    }
    async createTableSession(tableLabel, phone) {
        // Always complete any existing active session for this table before creating a new one.
        // A new OTP verification always starts a fresh dining session.
        await this.completeTableSession(tableLabel);
        const sessionId = (0, uuid_1.v4)();
        this.db.prepare(`
      INSERT INTO table_sessions (id, table_label, customer_phone, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(sessionId, tableLabel, phone);
        return {
            id: sessionId,
            tableLabel,
            customerPhone: phone,
            status: 'active'
        };
    }
    async getActiveTableSession(tableLabel) {
        const row = this.db.prepare(`
      SELECT * FROM table_sessions
      WHERE table_label = ? AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `).get(tableLabel);
        if (!row)
            return null;
        return {
            id: row.id,
            tableLabel: row.table_label,
            customerPhone: row.customer_phone,
            status: row.status
        };
    }
    async completeTableSession(tableLabel) {
        this.db.prepare(`
      UPDATE table_sessions
      SET status = 'completed', updated_at = datetime('now')
      WHERE table_label = ? AND status = 'active'
    `).run(tableLabel);
    }
    async isTableSessionActive(sessionId, tableLabel) {
        const row = this.db.prepare(`
      SELECT id FROM table_sessions
      WHERE id = ? AND table_label = ? AND status = 'active'
    `).get(sessionId, tableLabel);
        return Boolean(row);
    }
}
exports.SQLiteDatabase = SQLiteDatabase;
