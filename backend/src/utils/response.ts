import { Response } from 'express';

export function sendSuccess<T = any>(
  res: Response,
  data: T,
  message: string = 'Operation completed successfully.',
  statusCode: number = 200
) {
  return res.status(statusCode).json({
    success: true,
    statusCode,
    message,
    data,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

export function sendError(
  res: Response,
  message: string = 'An unexpected error occurred.',
  statusCode: number = 500,
  errors: any = null
) {
  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}
