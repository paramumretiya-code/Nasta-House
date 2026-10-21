import { Router, Request, Response, NextFunction } from 'express';
import { paymentService } from '../services/paymentService.js';

export const webhooksRouter = Router();

webhooksRouter.post('/webhooks/payments/:provider', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = String(req.params.provider);
    const signature = (req.headers['x-razorpay-signature'] as string) || '';
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    await paymentService.processWebhook(provider, rawBody, signature, req.body);

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

