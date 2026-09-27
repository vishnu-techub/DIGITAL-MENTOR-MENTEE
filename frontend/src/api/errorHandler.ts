/**
 * KSRCE Institutional Centralized API Error Handler
 *
 * Maps HTTP status codes & network conditions to user-friendly messages
 * without exposing sensitive stack traces, DB credentials, or server paths.
 */

export type ApiErrorType =
  | 'NETWORK_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STUDENT_NOT_FOUND'
  | 'MENTOR_NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'TOO_MANY_REQUESTS'
  | 'SERVER_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'OFFLINE'
  | 'UNKNOWN';

export interface FormattedError {
  type: ApiErrorType;
  title: string;
  message: string;
  statusCode: number;
}

/**
 * Format any HTTP status code or error into friendly institutional copy
 */
export function formatApiError(status: number, rawMessage?: string, endpoint?: string): FormattedError {
  const msgLower = (rawMessage || '').toLowerCase();
  const endLower = (endpoint || '').toLowerCase();

  // 0 / Network Failure / Offline
  if (status === 0 || !navigator.onLine || msgLower.includes('failed to fetch') || msgLower.includes('networkerror')) {
    return {
      type: 'NETWORK_ERROR',
      statusCode: 0,
      title: 'Unable to Connect',
      message: "We couldn't connect to the server. Please check your internet connection and try again.",
    };
  }

  // 400 Bad Request
  if (status === 400) {
    return {
      type: 'VALIDATION_ERROR',
      statusCode: 400,
      title: 'Invalid Request',
      message: rawMessage || 'Please verify the submitted institutional information and try again.',
    };
  }

  // 401 Unauthorized / Token Expired
  if (status === 401) {
    return {
      type: 'UNAUTHORIZED',
      statusCode: 401,
      title: 'Session Expired',
      message: 'Your session has expired. Please login again.',
    };
  }

  // 403 Forbidden / Access Denied
  if (status === 403) {
    return {
      type: 'FORBIDDEN',
      statusCode: 403,
      title: 'Access Denied',
      message: "You don't have permission to access this page.",
    };
  }

  // 404 Not Found
  if (status === 404) {
    if (msgLower.includes('student') || endLower.includes('student')) {
      return {
        type: 'STUDENT_NOT_FOUND',
        statusCode: 404,
        title: 'Student Not Found',
        message: 'The requested student profile could not be found.',
      };
    }
    if (msgLower.includes('mentor') || msgLower.includes('faculty') || endLower.includes('mentor') || endLower.includes('faculty')) {
      return {
        type: 'MENTOR_NOT_FOUND',
        statusCode: 404,
        title: 'Mentor Not Found',
        message: 'The requested mentor profile could not be found.',
      };
    }
    return {
      type: 'NOT_FOUND',
      statusCode: 404,
      title: 'Page Not Found',
      message: "The page you're looking for doesn't exist or may have been moved.",
    };
  }

  // 409 Conflict / Duplicate Record
  if (status === 409) {
    return {
      type: 'CONFLICT',
      statusCode: 409,
      title: 'Duplicate Entry',
      message: rawMessage || 'A record with this information already exists in the institutional database.',
    };
  }

  // 422 Unprocessable Entity
  if (status === 422) {
    return {
      type: 'VALIDATION_ERROR',
      statusCode: 422,
      title: 'Validation Error',
      message: rawMessage || 'Required institutional fields are missing or invalid.',
    };
  }

  // 429 Too Many Requests
  if (status === 429) {
    return {
      type: 'TOO_MANY_REQUESTS',
      statusCode: 429,
      title: 'Too Many Requests',
      message: 'Too many requests sent. Please wait a moment before trying again.',
    };
  }

  // 500 Internal Server Error
  if (status === 500) {
    return {
      type: 'SERVER_ERROR',
      statusCode: 500,
      title: 'Something Went Wrong',
      message: 'Something went wrong on our side. Please try again later.',
    };
  }

  // 502 / 503 / 504 Service / Database Unavailable
  if (status === 502 || status === 503 || status === 504) {
    return {
      type: 'SERVICE_UNAVAILABLE',
      statusCode: status,
      title: 'Service Temporarily Unavailable',
      message: "We're having trouble loading your data. Please try again shortly.",
    };
  }

  // Default fallback
  return {
    type: 'UNKNOWN',
    statusCode: status,
    title: 'Unexpected Error',
    message: rawMessage || 'An unexpected institutional error occurred.',
  };
}

/**
 * Custom institutional API error class
 */
export class ApiError extends Error {
  public type: ApiErrorType;
  public statusCode: number;
  public userTitle: string;
  public userMessage: string;
  public rawMessage?: string;
  public details?: any;

  constructor(statusCode: number, rawMessage?: string, endpoint?: string, details?: any) {
    const formatted = formatApiError(statusCode, rawMessage, endpoint);
    super(formatted.message);
    this.name = 'ApiError';
    this.type = formatted.type;
    this.statusCode = statusCode;
    this.userTitle = formatted.title;
    this.userMessage = formatted.message;
    this.rawMessage = rawMessage;
    this.details = details;
  }
}
