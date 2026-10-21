"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhooksRouter = void 0;
const express_1 = require("express");
const paymentService_js_1 = require("../services/paymentService.js");
exports.webhooksRouter = (0, express_1.Router)();
exports.webhooksRouter.post('/webhooks/payments/:provider', async (req, res, next) => {
    try {
        const provider = String(req.params.provider);
        const signature = req.headers['x-razorpay-signature'] || '';
        const rawBody = req.rawBody || JSON.stringify(req.body);
        await paymentService_js_1.paymentService.processWebhook(provider, rawBody, signature, req.body);
        res.status(200).json({ status: 'ok' });
    }
    catch (err) {
        next(err);
    }
});
