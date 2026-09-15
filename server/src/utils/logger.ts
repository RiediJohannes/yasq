import { LogLevel } from '@yasq/shared';

export enum LogCategory {
  AUTH = 'AUTH',
  DISCORD = 'DISCORD',
  GAME = 'GAME',
  GENERAL = 'GENERAL',
  SECURITY = 'SECURITY',
  CLIENT = 'CLIENT',
}

const getAppLogLevel = () =>
  LogLevel[(process.env.LOG_LEVEL || 'INFO').toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO;

export const logger = {
  debug: (instanceId: string, msg: string, category: LogCategory = LogCategory.GENERAL) =>
    getAppLogLevel() <= LogLevel.DEBUG && console.debug(`[DEBUG] [${instanceId}] [${category}] ${msg}`),

  info: (instanceId: string, msg: string, category: LogCategory = LogCategory.GENERAL) =>
    getAppLogLevel() <= LogLevel.INFO && console.info(`[INFO] [${instanceId}] [${category}] ${msg}`),

  warn: (instanceId: string, msg: string, category: LogCategory = LogCategory.GENERAL) =>
    getAppLogLevel() <= LogLevel.WARN && console.warn(`[WARN] [${instanceId}] [${category}] ${msg}`),

  error: (instanceId: string, msg: string, err?: unknown, category: LogCategory = LogCategory.GENERAL) => {
    if (getAppLogLevel() > LogLevel.ERROR) return;

    const errorDetails = err instanceof Error ? `: ${err.stack || err.message}` : err ? `: ${err}` : '';
    console.error(`[ERROR] [${instanceId}] [${category}] ${msg}${errorDetails}`);
  },
};
