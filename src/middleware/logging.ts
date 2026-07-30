import { Request, Response, NextFunction } from 'express';
import { apiLogger } from '../utils/logger';
import { AuthRequest } from '../types';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const user = (req as AuthRequest).user?.email || 'anonymous';
    const logMsg = `${method} ${originalUrl} ${res.statusCode} ${duration}ms - ${user} [${ip}]`;

    if (res.statusCode >= 500) {
      apiLogger.error(logMsg);
    } else if (res.statusCode >= 400) {
      apiLogger.warn(logMsg);
    } else {
      apiLogger.info(logMsg);
    }
  });

  next();
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  apiLogger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
}
