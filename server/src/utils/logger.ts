import { getDisplayName, LogLevel } from '@yasq/shared';
import { userDataCache } from '../helper.js';

export enum LogCategory {
  AUTH = 'AUTH',
  DISCORD = 'DISCORD',
  GAME = 'GAME',
  GENERAL = 'GENERAL',
  SECURITY = 'SECURITY',
  API = 'API',
  CLIENT = 'CLIENT',
}

const getAppLogLevel = () =>
  LogLevel[(process.env.LOG_LEVEL || 'INFO').toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO;

const logOutput: Record<LogLevel, (msg: string) => void> = {
  [LogLevel.DEBUG]: console.log,
  [LogLevel.INFO]: console.info,
  [LogLevel.WARN]: console.warn,
  [LogLevel.ERROR]: console.error,
};

export interface LogContext {
  instanceId?: string | null | undefined;
  clientUserId?: string | undefined;
  error?: Error | string | undefined;
}

export const logger = {
  log: (level: LogLevel, msg: string, category: LogCategory = LogCategory.GENERAL, context: LogContext = {}) => {
    if (getAppLogLevel() > level) return;

    const levelName = LogLevel[level] ?? 'INFO';
    let formattedMessage = `[${levelName}:${category}]`;

    if (context.instanceId) {
      formattedMessage += ` [${context.instanceId}]`;
    }
    if (context.clientUserId) {
      const participant = userDataCache.get(context.clientUserId);
      const userName = participant ? getDisplayName(participant) : 'unknown user';
      formattedMessage += ` [USER ${userName} (${context.clientUserId})]`;
    }
    formattedMessage += ` ${msg}`;
    if (context.error) {
      const err = context.error;
      const errorDetails = err instanceof Error ? `${err.stack || err.message}` : `Error: ${err}`;
      formattedMessage += ` -- ${errorDetails}`;
    }

    const logMessage: (msg: string) => void = logOutput[level];
    logMessage(formattedMessage);
  },

  debug: (msg: string, category: LogCategory, instanceId?: string) =>
    logger.log(LogLevel.DEBUG, msg, category, { instanceId }),

  info: (msg: string, category: LogCategory, instanceId?: string) =>
    logger.log(LogLevel.INFO, msg, category, { instanceId }),

  warn: (msg: string, category: LogCategory, instanceId?: string | null, error?: Error | string) =>
    logger.log(LogLevel.WARN, msg, category, { instanceId, error }),

  error: (msg: string, category: LogCategory, instanceId?: string | null, error?: Error | string) =>
    logger.log(LogLevel.ERROR, msg, category, { instanceId, error }),
};
