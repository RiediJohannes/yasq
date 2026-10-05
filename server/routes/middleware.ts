import type { NextFunction, Request, Response } from 'express';

import { coerceParam, validateToken } from '../src/helper.js';
import type { GameInstance } from '../src/models/game_instance.js';
import { LogCategory, logger } from '../src/utils/logger.js';
import { ApiError } from './errors.js';
import type { Guard, InferType, ObjectSchema, RawObject } from './guards.js';

declare global {
  namespace Express {
    // Extend Request type by additional optional fields
    interface Request {
      userId?: string;
      token?: string;
      game?: GameInstance;
    }
  }
}

/**
 * Authenticate a user via the Discord OAuth2 API based on the request's authorization header.
 */
export const authenticateUser = async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) throw new ApiError(401, 'No token provided', req);

  const token = authHeader.split(' ')[1] || '';
  const userId = await validateToken(token);

  if (!userId) {
    throw new ApiError(401, 'Invalid Discord token', req);
  }

  req.token = token;
  req.userId = userId;
  next();
};

/**
 * Checks if requesting user is host of the game.
 */
export const isHost = (req: Request, _res: Response, next: NextFunction) => {
  const userId = req.userId;

  if (!req.game?.isHost(userId!)) {
    logger.warn(`Unauthorized host attempt by user ${userId}`, LogCategory.SECURITY, req.body.instanceId);
    throw new ApiError(403, 'Only host can perform this action', req);
  }

  next();
};

export const createFetchGameMiddleware = (instances: Record<string, GameInstance>) => {
  /**
   * Fetches games by instanceId from instances.
   */
  return (req: Request, _res: Response, next: NextFunction) => {
    const instanceId = (req.params?.instanceId || req.body?.instanceId || req.query?.instanceId) as string | undefined;
    const game = instances[instanceId!];

    if (!game) {
      throw new ApiError(400, `Instance '${instanceId}' not found`, req);
    }

    req.game = game;
    next();
  };
};

/**
 * Validates an HTTP request's body structure against an {@link ObjectSchema} `S`.
 * Returns a sanitized object typed to `InferType<S>`, i.e. the type derived from the schema `S`.
 *
 * Each property in the `bodySchema` is validated against the checks of the respective {@link Guard}.
 * If a check fails, because the property value is of an **incorrect type** or violates **any other invariant**
 * guaranteed by the guard, an {@link ApiError} with `status: 400` and a descriptive error message is thrown.
 *
 * If the validation passes, the returned object is statically typed according to the {@link ObjectSchema} `S`. That is,
 * the return type of this function is `InferType<S>` (see {@link InferType}).
 */
export function validateBody<S extends ObjectSchema>(request: Request, bodySchema: S): InferType<S> {
  const body = (request.body ?? {}) as RawObject;
  const validatedBody: RawObject = {};

  for (const [key, guard] of Object.entries(bodySchema) as [string, Guard<unknown>][]) {
    const value = body[key];

    // Call the guard to evaluate its internal checks on the given value
    if (!guard(value)) {
      if (guard.errorFormatter) {
        throw new ApiError(400, guard.errorFormatter(value, key), request);
      }
      if (value === undefined) {
        throw new ApiError(400, `Missing property: ${key}`, request);
      }
      throw new ApiError(400, `Property '${key}' must be ${guard.description}`, request);
    }

    validatedBody[key] = value;
  }

  return validatedBody as InferType<S>;
}

/**
 * Validates an HTTP request's path parameters (`req.params`) against an {@link ObjectSchema} `S`.
 * Returns a sanitized object typed to `InferType<S>`, i.e. the type derived from the schema `S`.
 *
 * For each property in the `paramSchema`, a path parameter of the corresponding name is expected and its value
 * is validated against the checks of the respective {@link Guard}.
 * If a check fails, because the property value is of an **incorrect type** or violates **any other invariant**
 * guaranteed by the guard, an {@link ApiError} with `status: 400` and a descriptive error message is thrown.
 *
 * If the validation passes, the returned object is statically typed according to the {@link ObjectSchema} `S`. That is,
 * the return type of this function is `InferType<S>` (see {@link InferType}).
 */
export function validateParams<S extends ObjectSchema>(request: Request, paramSchema: S): InferType<S> {
  const params = (request.params ?? {}) as RawObject;
  const validatedParams: RawObject = {};

  for (const [key, guard] of Object.entries(paramSchema) as [string, Guard<unknown>][]) {
    const rawValue = params[key];
    const coercedValue = coerceParam(rawValue);

    // Test coerced value first, otherwise fall back to the raw value
    const valueToTest = guard(coercedValue) ? coercedValue : rawValue;

    if (!guard(valueToTest)) {
      if (guard.errorFormatter) {
        throw new ApiError(400, guard.errorFormatter(rawValue, key), request);
      }
      if (rawValue === undefined) {
        throw new ApiError(400, `Missing path parameter: ${key}`, request);
      }
      throw new ApiError(400, `Path parameter '${key}' must be ${guard.description}`, request);
    }

    validatedParams[key] = valueToTest;
  }

  return validatedParams as InferType<S>;
}
