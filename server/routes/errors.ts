import type { NextFunction, Request, Response } from 'express';

import { hasPathParams, hasQueryParams } from '../src/helper.js';
import { LogCategory, logger } from '../src/utils/logger.js';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly request: Request;

  constructor(statusCode: number, message: string, request: Request) {
    super(message);
    this.statusCode = statusCode;
    this.request = request;
    this.name = this.constructor.name;

    const routePattern = request.route ? `${request.baseUrl}${request.route.path}` : request.path;

    let stackMessage = `'${message}' in ${request.method} ${routePattern}`;

    if (hasQueryParams(request) || hasPathParams(request)) {
      stackMessage += `\nRequest target: ${request.originalUrl}`;
    }

    if (request.body != null) {
      const body = request.body;
      const isEmpty =
        (typeof body === 'object' && body !== null && Object.keys(body).length === 0) ||
        (typeof body === 'string' && body.trim() === '');

      if (!isEmpty) {
        stackMessage += `\nRequest body:\n${JSON.stringify(body, null, 2)}`;
      }
    }

    this.stack = stackMessage;
  }
}

export const handleNotFound = (req: Request, res: Response, _next: NextFunction) => {
  res.status(404).send(`<p>The requested endpoint <code>'${req.path}'</code> does not exist.</p>`);
};

export const handleErrors = (err: ApiError | Error, req: Request, res: Response, _next: NextFunction) => {
  const instanceId = (req.params?.instanceId || req.body?.instanceId || req.query?.instanceId) as string | undefined;

  // Known operational error
  if (err instanceof ApiError) {
    logger.error('Domain exception', LogCategory.API, instanceId, err);
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Unexpected error
  logger.error('Unhandled server error', LogCategory.API, instanceId, err);
  return res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
};
