import type { NextFunction, Request, Response } from 'express';

import { validateToken } from '../src/utils/helper.js';
import type { GameInstance } from '../src/models/game_instance.js';
import { LogCategory, logger } from '../src/utils/logger.js';
import { ApiError } from './errors.js';
import { z } from 'zod';

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
 * Checks if the requesting user is the game's host.
 */
export const isHost = (req: Request, _res: Response, next: NextFunction) => {
  const userId = req.userId;

  if (!req.game?.isHost(userId!)) {
    logger.warn(`Unauthorized host attempt by user ${userId}`, LogCategory.SECURITY, req.body.instanceId);
    throw new ApiError(403, 'Only host can perform this action', req);
  }

  next();
};

/**
 * Fetches the correct {@link GameInstance} based on the `instanceId` targeted by the request.
 */
export type FetchGameMiddleware = (req: Request, _res: Response, next: NextFunction) => void;

export const createFetchGameMiddleware = (instances: Record<string, GameInstance>): FetchGameMiddleware => {
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

export enum SanitizationMode {
  NO_SANITIZATION = 'loose',
  STRIP_UNKNOWN_PROPERTIES = 'normal',
  ERROR_ON_UNKNOWN_PROPERTIES = 'strict',
}

/**
 * Automatically wraps the provided schema in the appropriate {@link z.ZodObject Zod object} variant
 * based on the chosen {@link SanitizationMode} and pre-compiles it for optimal execution speed:
 * - `NO_SANITIZATION`: Preserves all properties not defined in the schema without validation ({@link z.looseObject}).
 * - `STRIP_UNKNOWN_PROPERTIES` (default): Strips any unknown property from the result ({@link z.object}).
 * - `ERROR_ON_UNKNOWN_PROPERTIES`: Rejects the entire validation if any unknown property is encountered ({@link z.strictObject}).
 *
 * @example
 *  const bodySchema = defineSchema({
 *    ready: z.boolean(),
 *    setupDuration: z.number(),
 *  }, SanitizationMode.STRIP_UNKNOWN_PROPERTIES);
 */
export function defineSchema<Z extends z.ZodRawShape>(
  objectStructure: Z,
  mode: SanitizationMode = SanitizationMode.STRIP_UNKNOWN_PROPERTIES
) {
  switch (mode) {
    case SanitizationMode.ERROR_ON_UNKNOWN_PROPERTIES:
      return z.compile(z.strictObject(objectStructure));
    case SanitizationMode.NO_SANITIZATION:
      return z.compile(z.looseObject(objectStructure));
    case SanitizationMode.STRIP_UNKNOWN_PROPERTIES:
    default:
      return z.compile(z.object(objectStructure));
  }
}

/** Formats a {@link z.ZodError} into a clean error string to be sent in the REST response. */
function formatZodError(error: z.ZodError, target: RequestComponent): string {
  const firstIssue = error.issues[0];
  if (!firstIssue) return `Invalid ${target}`;

  const path = firstIssue.path.join('.');
  const targetLabel = target === RequestComponent.BODY ? 'body property' : `${target} parameter`;

  // Missing required field
  if (firstIssue.input === undefined && ['invalid_type', 'invalid_value'].includes(firstIssue.code)) {
    return path ? `Missing ${targetLabel}: ${path}` : `Missing ${targetLabel}`;
  }

  if (path) {
    return `Invalid ${targetLabel} '${path}': ${firstIssue.message.replace(': ', ' - ')}`;
  }

  return firstIssue.message;
}

export type UntypedObject = Record<string, unknown>;
/** An object with strictly no properties, hence every value of this record is of type 'never' */
type EmptyObject = Record<string, never>;
type InferOrEmpty<T> = [T] extends [never] ? EmptyObject : [T] extends [z.ZodType] ? z.infer<T> : EmptyObject;
/** Flattens intersection types */
type Flatten<T> = { [K in keyof T]: T[K] } & {};

type MergeSchemas<B, P, Q> = Flatten<InferOrEmpty<B> & InferOrEmpty<P> & InferOrEmpty<Q>>;

const enum RequestComponent {
  BODY = 'body',
  PARAMS = 'params',
  QUERY = 'query',
}

interface ValidationTarget {
  name: RequestComponent;
  schema: z.ZodType | undefined;
  inputData: unknown;
}

export interface RequestSchemas<
  B extends z.ZodType = z.ZodType,
  P extends z.ZodType = z.ZodType,
  Q extends z.ZodType = z.ZodType,
> {
  body?: B;
  params?: P;
  query?: Q;
}

// Define the signature of two overloads for the validateRequest function
export function validateRequest<B extends z.ZodType>(request: Request, bodySchema: B): z.infer<B>;
export function validateRequest<B extends z.ZodType = never, P extends z.ZodType = never, Q extends z.ZodType = never>(
  request: Request,
  schemas: RequestSchemas<B, P, Q>
): MergeSchemas<B, P, Q>;

/**
 * Validates an HTTP request's `body`, `params`, and/or `query` against the given {@link z.ZodType Zod Schema(s)}.
 * Upon successful validation, the function returns a flattened object encompassing all validated fields,
 * optionally stripping unknown properties depending on each schema's {@link SanitizationMode}.
 * Each property in the returned object is statically typed according to the original schema.
 *
 * In the case of a validation failure, the function throws an {@link ApiError} with status `400` and a descriptive
 * error message of the violated invariant.
 *
 * **Note:** Since the result is given as a single, flattened object, property names must be unique across all
 * request components (body/params/query). If a violation of this assumption is detected, the function throws a plain
 * `Error` detailing the duplicate property name.
 */
export function validateRequest(request: Request, schemaOrSchemas: z.ZodType | RequestSchemas): UntypedObject {
  const isSingleSchema = schemaOrSchemas instanceof z.ZodType || 'safeParse' in schemaOrSchemas;

  // If we just received a single schema, we interpret it as a body schema by default
  const schemas: RequestSchemas = isSingleSchema
    ? { body: schemaOrSchemas as z.ZodType }
    : (schemaOrSchemas as RequestSchemas);

  const targets: ValidationTarget[] = [
    { name: RequestComponent.PARAMS, schema: schemas.params, inputData: request.params ?? {} },
    { name: RequestComponent.QUERY, schema: schemas.query, inputData: request.query ?? {} },
    { name: RequestComponent.BODY, schema: schemas.body, inputData: request.body ?? {} },
  ];

  const mergedResult: UntypedObject = {};

  for (const target of targets) {
    if (!target.schema) continue;

    const parseResult = target.schema.safeParse(target.inputData, { reportInput: true });
    if (!parseResult.success) {
      throw new ApiError(400, formatZodError(parseResult.error, target.name), request);
    }

    const data = parseResult.data as UntypedObject;

    for (const key of Object.keys(data)) {
      // A property key must be unique across all request component schemas, otherwise we cannot merge the results
      if (key in mergedResult) {
        throw new Error(`Property collision detected: Key '${key}' exists in multiple request component schemas.`);
      }
      mergedResult[key] = data[key];
    }
  }

  return mergedResult;
}
