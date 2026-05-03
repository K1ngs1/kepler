import { logger } from './logger';

export interface AppError {
  message: string;
  code?: string;
  context?: Record<string, unknown>;
}

export function handleError(err: unknown, context?: Record<string, unknown>): AppError {
  if (err instanceof Error) {
    logger.error(err.message, { ...context, stack: err.stack });
    return { message: err.message, context };
  }

  if (typeof err === 'string') {
    logger.error(err, context);
    return { message: err, context };
  }

  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { message: string; code?: string };
    logger.error(e.message, { ...context, code: e.code });
    return { message: e.message, code: e.code, context };
  }

  logger.error('An unknown error occurred', context);
  return { message: 'An unknown error occurred', context };
}

export function friendlyMessage(err: AppError): string {
  const msg = err.message?.toLowerCase() ?? '';

  if (msg.includes('jwt') || msg.includes('auth') || msg.includes('unauthorized')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (msg.includes('not found') || msg.includes('does not exist')) {
    return 'That item could not be found.';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('connect')) {
    return 'Network error. Check your connection and try again.';
  }
  if (msg.includes('for_trade') || msg.includes('no longer')) {
    return 'One or more cards in this trade are no longer available for trade.';
  }
  if (msg.includes('permission') || msg.includes('rls') || msg.includes('policy')) {
    return 'You do not have permission to perform this action.';
  }

  return err.message || 'Something went wrong. Please try again.';
}
