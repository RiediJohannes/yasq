export enum LogCategory {
  AUTH = 'AUTH',
  DISCORD = 'DISCORD',
  GAME = 'GAME',
  GENERAL = 'GENERAL',
  SECURITY = 'SECURITY',
}

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const getLogLevel = () => LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase() as keyof typeof LEVELS] ?? 1;

export const logger = {
  debug: (instanceId: string, msg: string, category: LogCategory = LogCategory.GENERAL) =>
    getLogLevel() <= LEVELS.debug && console.debug(`[DEBUG] [${instanceId}] [${category}] ${msg}`),

  info: (instanceId: string, msg: string, category: LogCategory = LogCategory.GENERAL) =>
    getLogLevel() <= LEVELS.info && console.info(`[INFO] [${instanceId}] [${category}] ${msg}`),

  warn: (instanceId: string, msg: string, category: LogCategory = LogCategory.GENERAL) =>
    getLogLevel() <= LEVELS.warn && console.warn(`[WARN] [${instanceId}] [${category}] ${msg}`),

  error: (instanceId: string, msg: string, err?: unknown, category: LogCategory = LogCategory.GENERAL) => {
    if (getLogLevel() > LEVELS.error) return;

    const errorDetails = err instanceof Error ? `: ${err.stack || err.message}` : err ? `: ${err}` : '';
    console.error(`[ERROR] [${instanceId}] [${category}] ${msg}${errorDetails}`);
  },
};
