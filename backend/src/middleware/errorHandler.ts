import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  if (statusCode >= 400) {
    console.error(`[ERROR ${statusCode}]`, err?.message, err?.constructor?.name, (err as any)?.code);
  }

  // Prevent ERR_HTTP_HEADERS_SENT crash if response already started
  if (res.headersSent) {
    console.error('[ERROR] Headers already sent, skipping error response');
    return;
  }

  res.status(statusCode).json({
    error: message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/** Helper to create operational errors */
export function createError(message: string, statusCode = 400): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
}
