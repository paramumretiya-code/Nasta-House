import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'nasto-house-super-secret-jwt-key-for-dev-only-min-32-chars';

export interface AuthUser {
  id: string;
  username: string;
  role: 'manager' | 'admin';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

export function requireManagerAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Missing or invalid authentication token',
        requestId: req.requestId || 'req-unknown'
      }
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    if (decoded.role !== 'manager' && decoded.role !== 'admin') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient role permissions for manager dashboard',
          requestId: req.requestId || 'req-unknown'
        }
      });
      return;
    }

    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Authentication token has expired or is invalid',
        requestId: req.requestId || 'req-unknown'
      }
    });
  }
}

export function generateManagerToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '12h' });
}

