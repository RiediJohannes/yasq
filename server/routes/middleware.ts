import type { NextFunction, Request, Response } from 'express';

import { validateToken } from '../src/helper.js';
import type { GameInstance } from '../src/models/game_instance.js';
import { LogCategory, logger } from '../src/utils/logger.js';
import { ApiError } from './errors.js';

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
export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
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
export const isHost = (req: Request, res: Response, next: NextFunction) => {
  const userId = req.userId;

  if (!req.game?.isHost(userId!)) {
    logger.warn(`Unauthorized host attempt by user ${userId}`, LogCategory.SECURITY, req.body.instanceId);
    throw new ApiError(403, 'Only host can perform this action', req);
  }

  next();
};

export const createGameMiddleware = (instances: Record<string, GameInstance>) => {
  /**
   * Fetches games by instanceId from instances.
   */
  return (req: Request, res: Response, next: NextFunction) => {
    const instanceId = (req.params?.instanceId || req.body?.instanceId || req.query?.instanceId) as string | undefined;
    const game = instances[instanceId!];

    if (!game) {
      throw new ApiError(400, `Instance '${instanceId}' not found`, req);
    }

    req.game = game;
    next();
  };
};
