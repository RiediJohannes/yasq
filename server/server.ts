import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { GameInstance } from './src/models.js';

import { setupRoutes } from './routes/routes.js';
import { setupMockRoutes } from './routes/mockRoutes.js';
import { getGameStatusPayload, invalidateToken, setupTempDir, validateToken } from './src/helper.js';
import {
  STATIC_FILES_DIR,
  TEMP_FILES_DIR,
  WS_GAME_STATUS_UPDATE_EVENT,
  WS_JOIN_INSTANCE_EVENT,
  type Playlist,
  type Track,
} from '@yasq/shared';
import { LogCategory, logger } from './src/utils/logger.js';

dotenv.config({ path: '../.env' });

function loadTracks(tracksPath: string): Track[] {
  if (!fs.existsSync(tracksPath)) {
    console.error(`Tracks file not found at ${tracksPath}.`);
    process.exit(1);
  }

  try {
    const tracksRaw = fs.readFileSync(tracksPath, 'utf-8');
    return JSON.parse(tracksRaw) as Track[];
  } catch (err) {
    console.error(`Error parsing JSON from ${tracksPath}:`, err);
    process.exit(1);
  }
}

function loadPlaylists(playlistsPath: string): Playlist[] {
  if (!fs.existsSync(playlistsPath)) {
    console.log(`Playlists file not found at ${playlistsPath}. Starting with no playlists.`);
    return [];
  }

  try {
    const playlistsRaw = fs.readFileSync(playlistsPath, 'utf-8');
    return JSON.parse(playlistsRaw) as Playlist[];
  } catch (err) {
    console.error(`Error parsing JSON from ${playlistsPath}:`, err);
    return [];
  }
}

function setupFileWatcher(filePath: string, onFileChange: () => void, fileName: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  let changeTimeout: NodeJS.Timeout | null = null;

  fs.watch(filePath, (_eventType, _filename) => {
    // Debounce to avoid multiple triggers from the same change
    if (changeTimeout) clearTimeout(changeTimeout);
    changeTimeout = setTimeout(() => {
      try {
        onFileChange();
        console.log(`✓ ${fileName} reloaded`);
      } catch (err) {
        console.error(`Error reloading ${fileName}:`, err);
      }
    }, 100);
  });
}

export function setupServer() {
  const isMockMode = process.env.VITE_MOCK_MODE === 'true';
  const instances: Record<string, GameInstance> = {};

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const tracksPath = isMockMode
    ? path.join(__dirname, '..', 'mock_data', 'mockTracks.json')
    : path.join(__dirname, STATIC_FILES_DIR, 'tracks.json');

  const playlistsPath = isMockMode
    ? path.join(__dirname, '..', 'mock_data', 'mockPlaylists.json')
    : path.join(__dirname, STATIC_FILES_DIR, 'playlists.json');

  // Cache the data in memory
  let cachedTracks = loadTracks(tracksPath);
  let cachedPlaylists = loadPlaylists(playlistsPath);

  // Watch for file changes and update cache
  setupFileWatcher(
    tracksPath,
    () => {
      cachedTracks = loadTracks(tracksPath);
      server.emit('tracks-updated');
    },
    'Tracks'
  );

  setupFileWatcher(
    playlistsPath,
    () => {
      cachedPlaylists = loadPlaylists(playlistsPath);
      server.emit('playlists-updated');
    },
    'Playlists'
  );

  const app = express();

  const httpServer = createServer(app);
  const server = new Server(httpServer, { cors: { origin: '*' } });

  server.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Missing token'));

    try {
      const userId = await validateToken(token);

      // Bind it to the socket so it's available everywhere
      socket.data.userId = userId;
      next();
    } catch (err) {
      next(new Error(`Invalid token: ${err}`));
    }
  });

  server.on('connection', socket => {
    socket.on(WS_JOIN_INSTANCE_EVENT, ({ instanceId }) => {
      socket.join(instanceId);
      socket.data.instanceId = instanceId;

      // Use userId from the middleware
      const userId = socket.data.userId;

      // If no one has registered for this instance yet, this user is the host
      if (!instances[instanceId]) {
        instances[instanceId] = new GameInstance(instanceId, userId);
      }

      const game = instances[instanceId];

      game.registeredUsers.add(userId);
      logger.debug(instanceId, `Player ${userId} joined the game`, LogCategory.GENERAL);

      server.to(instanceId).emit(WS_GAME_STATUS_UPDATE_EVENT, getGameStatusPayload(game));
    });

    socket.on('disconnect', () => {
      const { userId, instanceId } = socket.data;
      if (!userId || !instanceId) return;

      const game = instances[instanceId];
      if (!game) return;

      game.registeredUsers.delete(userId);
      logger.debug(instanceId, `Player ${userId} left the game`, LogCategory.GENERAL);

      invalidateToken(socket.handshake.auth.token);

      if (game.isHost(userId)) {
        const isGameActive = game.pickNewHost();

        if (!isGameActive) {
          logger.debug(instanceId, `Terminating empty instance`, LogCategory.GENERAL);
          game.dispose();
          delete instances[instanceId];
        }
      }

      server.to(instanceId).emit(WS_GAME_STATUS_UPDATE_EVENT, getGameStatusPayload(game));
    });
  });

  // Allow express to parse JSON bodies
  app.use(express.json());
  app.use('/music', express.static(path.join(__dirname, STATIC_FILES_DIR, 'music')));
  app.use('/game_covers', express.static(path.join(__dirname, STATIC_FILES_DIR, 'game_covers')));

  // Folder for serving temporary static files
  const tempDir = setupTempDir(__dirname);
  app.use(`/${TEMP_FILES_DIR}`, express.static(tempDir));

  // Register routes for REST communication between clients and server
  // Pass getter functions that return cached data
  app.use(
    '/api',
    setupRoutes(
      server,
      instances,
      () => cachedTracks,
      () => cachedPlaylists
    )
  );

  // Add a simple endpoint for health checks
  app.get('/health', (req, res) => {
    res.status(200).json({ ok: true });
  });

  // Only register mock routes when server is started in mock mode
  if (isMockMode) {
    console.log('[MODE] Server is running in mock mode');
    app.use('/api/test', setupMockRoutes(server, instances));
  }

  return httpServer;
}
