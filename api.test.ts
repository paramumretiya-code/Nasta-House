import assert from 'node:assert';
import { SQLiteDatabase } from '../src/db/sqlite.js';
import path from 'node:path';
import fs from 'node:fs';

async function runTests() {
  console.log('--- Starting Nasto House Core Engine & API Verification ---');

  // Use a dedicated temporary test database
  const testDbPath = path.resolve(process.cwd(), '.data', 'test_nasto.sqlite');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const db = new SQLiteDatabase(testDbPath);
  await db.init();
  console.log('✓ Database initialized and seeded');

  // 1. Menu test
  const menu = await db.getMenu();
  assert(menu.categories.length > 0, 'Categories should not be empty');
  assert(menu.items.length > 0, 'Menu items should not be empty');
  console.log(`✓ Menu retrieved: ${menu.categories.length} categories, ${menu.items.length} items`);

  // 2. Tables test
  const tables = await db.getDiningTables();
  assert(tables.length > 0, 'Dining tables should exist');
  console.log(`✓ Tables retrieved: ${tables.length} dining tables`);

  // 3. Create order test
  const sampleItem1 = menu.items[0];
  const sampleItem2 = menu.items[1];

  const order = await db.createOrder({
    tableLabel: 'Table 1 (Window)',
    orderType: 'dine-in',
    items: [
      { menuItemId: sampleItem1.id, quantity: 2, itemNote: 'Extra spicy' },
      { menuItemId: sampleItem2.id, quantity: 1 }
    ],
    customerNote: 'Please serve quickly'
  });

  assert(order.id, 'Order should have an ID');
  assert.strictEqual(order.status, 'placed');
  assert.strictEqual(order.payment_status, 'unpaid');
  assert.strictEqual(order.version, 1);
  assert.strictEqual(order.items?.length, 2);

  const expectedSubtotal = sampleItem1.price_paise * 2 + sampleItem2.price_paise * 1;
  assert.strictEqual(order.subtotal_paise, expectedSubtotal, 'Subtotal should match server pricing calculation');
  console.log(`✓ Order #${order.order_number} created with total ₹${(order.total_paise / 100).toFixed(2)} (version 1)`);

  // 4. Concurrency check: try updating with wrong expectedVersion (should fail)
  try {
    await db.updateOrderItems({
      orderId: order.id,
      expectedVersion: 999, // Outdated/wrong version
      managerNote: 'Conflict attempt'
    });
    assert.fail('Should have thrown ORDER_VERSION_CONFLICT');
  } catch (err: any) {
    assert.strictEqual(err.code, 'ORDER_VERSION_CONFLICT');
    console.log('✓ Optimistic concurrency control successfully rejected stale version 999');
  }

  // 5. Manager edits order items (change quantity)
  const updatedOrder = await db.updateOrderItems({
    orderId: order.id,
    expectedVersion: 1,
    items: [
      { menuItemId: sampleItem1.id, quantity: 3 } // increased from 2 to 3
    ],
    managerNote: 'Adjusted quantity per customer request',
    actorName: 'Manager Dave'
  });

  assert.strictEqual(updatedOrder.version, 2, 'Version should increment to 2');
  assert.strictEqual(updatedOrder.customer_acknowledged_edits, false, 'Customer must acknowledge changed total');
  const expectedNewSubtotal = sampleItem1.price_paise * 3;
  assert.strictEqual(updatedOrder.subtotal_paise, expectedNewSubtotal);
  console.log(`✓ Manager edited order: Version incremented to 2, new total ₹${(updatedOrder.total_paise / 100).toFixed(2)}`);

  // 6. Customer acknowledges the price change
  const ackOrder = await db.acknowledgeOrderEdits(order.id);
  assert.strictEqual(ackOrder.customer_acknowledged_edits, true, 'Edits acknowledged by customer');
  console.log('✓ Customer acknowledged revised order total');

  // 7. Status transition: placed -> accepted -> preparing
  const acceptedOrder = await db.updateOrderStatus(order.id, 2, 'accepted', 'Kitchen accepted');
  assert.strictEqual(acceptedOrder.status, 'accepted');
  assert.strictEqual(acceptedOrder.version, 3);
  console.log('✓ Order transitioned: placed -> accepted (version 3)');

  const preparingOrder = await db.updateOrderStatus(order.id, 3, 'preparing', 'Chef cooking');
  assert.strictEqual(preparingOrder.status, 'preparing');
  assert.strictEqual(preparingOrder.version, 4);
  console.log('✓ Order transitioned: accepted -> preparing (version 4)');

  // 8. Invalid status transition check: preparing -> placed (should fail)
  try {
    await db.updateOrderStatus(order.id, 4, 'placed');
    assert.fail('Should reject invalid status transition');
  } catch (err: any) {
    assert.strictEqual(err.code, 'INVALID_STATUS_TRANSITION');
    console.log('✓ Invalid state transition properly rejected by state machine');
  }

  // 9. Manual Cash payment settlement
  const paymentResult = await db.recordManualPayment(
    order.id,
    4,
    'cash',
    'CASH_RCP_001',
    'Customer paid cash at counter',
    'mgr_1',
    'Manager Dave'
  );
  assert.strictEqual(paymentResult.order.payment_status, 'paid');
  assert.strictEqual(paymentResult.order.status, 'completed', 'Order must be auto-completed upon payment');
  assert(paymentResult.order.completed_at, 'completed_at must be populated upon payment');
  assert.strictEqual(paymentResult.payment.status, 'succeeded');
  assert.strictEqual(paymentResult.order.version, 5);
  console.log('✓ Manual cash payment recorded and verified; order marked paid and completed automatically (version 5)');

  // 10. Audit log verification
  const auditLogs = await db.getAuditLogs(order.id);
  assert(auditLogs.length >= 4, 'Audit logs should record placement, edits, status transitions, and payment');
  console.log(`✓ Audit log verified: ${auditLogs.length} audit entries tracked for order #${order.order_number}`);

  // 11. Test exactly 10 tables
  const tenTables = await db.getDiningTables();
  assert.strictEqual(tenTables.length, 10, 'Must have exactly 10 tables');
  assert.strictEqual(tenTables[0].label, 'Table 1');
  assert.strictEqual(tenTables[9].label, 'Table 10');
  console.log('✓ Verified exactly 10 tables (Table 1 through Table 10)');

  // 12. Test table occupancy check
  const table2 = tenTables[1];
  const orderOnT2 = await db.createOrder({
    tableId: table2.id,
    tableLabel: table2.label,
    orderType: 'dine-in',
    items: [{ menuItemId: sampleItem1.id, quantity: 1 }]
  });
  console.log(`✓ Created active order #${orderOnT2.order_number} on ${table2.label}`);

  // Attempting another dine-in order on Table 2 while occupied must fail
  try {
    await db.createOrder({
      tableId: table2.id,
      tableLabel: table2.label,
      orderType: 'dine-in',
      items: [{ menuItemId: sampleItem1.id, quantity: 1 }]
    });
    assert.fail('Should have failed due to TABLE_OCCUPIED');
  } catch (err: any) {
    assert.strictEqual(err.code, 'TABLE_OCCUPIED');
    console.log('✓ Successfully blocked second dine-in order on occupied table (TABLE_OCCUPIED)');
  }

  // 13. Test UPI payment verification request
  const upiClaim = await db.requestPaymentVerification(orderOnT2.id, 'UTR987654321012');
  assert.strictEqual(upiClaim.order.payment_status, 'awaiting_verification');
  console.log('✓ Customer UPI verification claim properly set status to awaiting_verification');

  // 14. Test Shop ON/OFF control
  await db.setShopOpen(false);
  const closedSettings = await db.getShopSettings();
  assert.strictEqual(closedSettings.is_open, false);
  console.log('✓ Shop closed via setShopOpen(false)');

  try {
    await db.createOrder({
      orderType: 'takeaway',
      items: [{ menuItemId: sampleItem1.id, quantity: 1 }]
    });
    assert.fail('Should have failed due to SHOP_CLOSED');
  } catch (err: any) {
    assert.strictEqual(err.code, 'SHOP_CLOSED');
    console.log('✓ Successfully rejected order submission when shop is closed (SHOP_CLOSED)');
  }

  // Re-open shop
  await db.setShopOpen(true);
  const openSettings = await db.getShopSettings();
  assert.strictEqual(openSettings.is_open, true);
  console.log('✓ Shop reopened via setShopOpen(true)');

  // 15. Dashboard Stats verification
  const stats = await db.getDashboardStats();
  assert(stats.runningOrdersCount >= 1, 'Running orders count should be tracked');
  assert(typeof stats.todayVerifiedRevenuePaise === 'number', 'Verified revenue should be tracked');
  console.log(`✓ Dashboard daily stats verified (Running: ${stats.runningOrdersCount}, Revenue: ₹${stats.todayVerifiedRevenuePaise / 100})`);

  // 16. Live Menu CRUD & Sold Out toggle test
  const catId = menu.categories[0].id;
  const newItem = await db.createMenuItem({
    categoryId: catId,
    name: 'Special Gujarati Thali',
    description: 'Authentic lunch thali with sweets and farsan',
    pricePaise: 25000,
    imagePath: '/images/menu/special-thali.jpg',
    isAvailable: true
  });
  assert(newItem.id, 'New menu item must have an ID');
  assert.strictEqual(newItem.name, 'Special Gujarati Thali');
  assert.strictEqual(newItem.price_paise, 25000);
  console.log(`✓ Created menu item: ${newItem.name} (₹${newItem.price_paise / 100})`);

  // Edit item
  const editedItem = await db.updateMenuItem(newItem.id, {
    name: 'Special Gujarati Deluxe Thali',
    pricePaise: 28000
  });
  assert.strictEqual(editedItem.name, 'Special Gujarati Deluxe Thali');
  assert.strictEqual(editedItem.price_paise, 28000);
  console.log(`✓ Updated menu item: ${editedItem.name} (₹${editedItem.price_paise / 100})`);

  // Toggle Sold Out (is_available = false)
  const soldOutItem = await db.setMenuItemAvailability(newItem.id, false);
  assert.strictEqual(Boolean(soldOutItem.is_available), false, 'Item must be marked sold out (is_available = false)');
  const menuWithSoldOut = await db.getMenu();
  const foundSoldOut = menuWithSoldOut.items.find((i) => i.id === newItem.id);
  assert(foundSoldOut, 'Sold out item must still remain in customer menu so SOLD OUT badge can be displayed');
  assert.strictEqual(Boolean(foundSoldOut?.is_available), false, 'is_available must be false');
  console.log('✓ Sold out toggle verified: item remains visible with is_available = false for SOLD OUT badge');

  // Toggle Back to Available (is_available = true)
  const availableItem = await db.setMenuItemAvailability(newItem.id, true);
  assert.strictEqual(Boolean(availableItem.is_available), true);
  console.log('✓ Restored item availability: is_available = true');

  // Soft delete item (is_active = 0)
  const deleted = await db.deleteMenuItem(newItem.id);
  assert.strictEqual(deleted, true);
  const menuAfterDelete = await db.getMenu();
  const foundDeleted = menuAfterDelete.items.find((i) => i.id === newItem.id);
  assert(!foundDeleted, 'Soft-deleted item must not appear in active menu');
  console.log('✓ Soft delete verified: item successfully removed from customer menu');

  // Cleanup test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('---------------------------------------------------------');
  console.log('🎉 ALL BACKEND BUSINESS LOGIC & UPGRADE TESTS PASSED!');
  console.log('---------------------------------------------------------');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});


