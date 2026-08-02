import type { NextFunction, Request, Response } from 'express';

import { validateToken } from '../src/helper.js';
import type { GameInstance } from '../src/models.js';
import { LogCategory, logger } from '../src/utils/logger.js';

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

export const createGameMiddlewares = (instances: Record<string, GameInstance>) => {
  /**
   * Authenticate a user via the Discord OAuth2 API based on the request's authorization header.
   */
  const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send({ error: 'No token provided' });

    const token = authHeader.split(' ')[1] || '';
    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: 'Invalid Discord token' });
    }

    req.token = token;
    req.userId = userId;
    next();
  };

  /**
   * Fetches games by instanceId from instances.
   */
  const fetchGame = (req: Request, res: Response, next: NextFunction) => {
    const { instanceId } = req.body || req.query;
    const game = instances[instanceId];

    if (!game) {
      return res.status(400).send({ error: 'Instance not found' });
    }

    req.game = game;
    next();
  };

  /**
   * Checks if requesting user is host of the game.
   */
  const isHost = (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId;

    if (!req.game?.isHost(userId!)) {
      logger.warn(req.body.instanceId, `Unauthorized host attempt by user ${userId}`, LogCategory.SECURITY);
      return res.status(403).json({ error: 'Only host can perform this action' });
    }

    next();
  };

  return { authenticateUser, fetchGame, isHost };
};
