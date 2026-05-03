type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV === 'production') {
    console[level](JSON.stringify(entry));
  } else {
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    console[level](`[${entry.timestamp}] [${level.toUpperCase()}] ${message}${ctx}`);
  }
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),

  auth: (event: string, userId?: string) =>
    log('info', `Auth: ${event}`, userId ? { userId } : undefined),

  trade: (event: string, tradeId: string, userId?: string) =>
    log('info', `Trade: ${event}`, { tradeId, ...(userId ? { userId } : {}) }),
};
