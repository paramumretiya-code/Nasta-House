import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const status = err.status || (err.statusCode ? Number(err.statusCode) : 500);
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected error occurred';
  const requestId = req.requestId || (req.headers['x-request-id'] as string) || 'req-unknown';

  if (status >= 500) {
    console.error(`[Error] [${requestId}] ${req.method} ${req.url}:`, err);
  }

  res.status(status).json({
    error: {
      code,
      message,
      requestId
    }
  });
}

