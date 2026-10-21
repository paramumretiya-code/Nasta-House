"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.menuRouter = void 0;
const express_1 = require("express");
const index_js_1 = require("../db/index.js");
exports.menuRouter = (0, express_1.Router)();
exports.menuRouter.get('/menu', async (req, res, next) => {
    try {
        const db = await (0, index_js_1.getDatabase)();
        const { categories, items } = await db.getMenu();
        res.json({
            data: {
                categories,
                items
            }
        });
    }
    catch (err) {
        next(err);
    }
});
exports.menuRouter.get('/tables', async (req, res, next) => {
    try {
        const db = await (0, index_js_1.getDatabase)();
        const tables = await db.getDiningTables();
        res.json({
            data: tables
        });
    }
    catch (err) {
        next(err);
    }
});
exports.menuRouter.get('/settings', async (req, res, next) => {
    try {
        const db = await (0, index_js_1.getDatabase)();
        const settings = await db.getShopSettings();
        res.json({
            data: settings
        });
    }
    catch (err) {
        next(err);
    }
});
exports.menuRouter.get('/shop-status', async (req, res, next) => {
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
