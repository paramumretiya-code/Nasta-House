import { Router, Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/index.js';

export const menuRouter = Router();

menuRouter.get('/menu', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = await getDatabase();
    const { categories, items } = await db.getMenu();
    res.json({
      data: {
        categories,
        items
      }
    });
  } catch (err) {
    next(err);
  }
});

menuRouter.get('/tables', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = await getDatabase();
    const tables = await db.getDiningTables();
    res.json({
      data: tables
    });
  } catch (err) {
    next(err);
  }
});

menuRouter.get('/settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = await getDatabase();
    const settings = await db.getShopSettings();
    res.json({
      data: settings
    });
  } catch (err) {
    next(err);
  }
});

menuRouter.get('/shop-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = await getDatabase();
    const settings = await db.getShopSettings();
    res.json({
      data: {
        is_open: settings.is_open,
        merchant_name: settings.merchant_name,
        merchant_upi_id: settings.merchant_upi_id
      }
    });
  } catch (err) {
    next(err);
  }
});

