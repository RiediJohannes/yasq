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
import {
  getDataSourceDir,
  getFilePath,
  getGameStatusPayload,
  invalidateToken,
  isMockMode,
  setupTempDir,
  validateToken,
} from './src/helper.js';
import {
  type Playlist,
  SAMPLE_DATA_DIR,
  STATIC_FILES_DIR,
  TEMP_FILES_DIR,
  type Track,
  WS_GAME_STATUS_UPDATE_EVENT,
  WS_JOIN_INSTANCE_EVENT,
} from '@yasq/shared';
import { LogCategory, logger } from './src/utils/logger.js';
import { loadPermissions } from './src/access_control.js';

dotenv.config({ path: '../.env' });

function abortStartup(message: string, exitCode: number): never {
  console.error(`[FATAL] ${message}`);
  process.exit(exitCode);
}

export function validateDataSource(
  projectRoot: string,
  dataRoot: string = path.resolve(projectRoot, STATIC_FILES_DIR)
): string {
  const dataSubdirectories = fs.readdirSync(dataRoot, { withFileTypes: true }).filter(item => item.isDirectory());

  if (dataSubdirectories.length === 0) {
    abortStartup(
      `No quiz data provided. Please add the necessary files in '${dataRoot}' as described in the README!`,
      10
    );
  } else if (dataSubdirectories.length > 1 && !process.env.DATA_SOURCE) {
    console.log(
      `Detected multiple data sources in ${dataRoot}. To select a specific source, set the DATA_SOURCE environment variable. Falling back to '${SAMPLE_DATA_DIR}'.`
    );
  }

  const dataSourcePath = getDataSourceDir();

  // Reject absolute paths
  if (path.posix.isAbsolute(dataSourcePath) || path.win32.isAbsolute(dataSourcePath)) {
    abortStartup(`DATA_SOURCE must be a relative path. Received: '${dataSourcePath}'`, 10);
  }

  let resolvedTarget = path.resolve(dataRoot, dataSourcePath);
  const relativePathToTarget = path.relative(dataRoot, resolvedTarget);

  // Reject attempts to escape the data directory
  const isOutsideDataRoot = relativePathToTarget.startsWith('..') || path.isAbsolute(relativePathToTarget);
  if (isOutsideDataRoot) {
    abortStartup(`DATA_SOURCE '${dataSourcePath}' escapes data root directory '${dataRoot}'.`, 11);
  }

  // Ensure source path actually exists
  if (!fs.existsSync(resolvedTarget)) {
    // Fallback: If there is only one subdirectory in dataRoot and the user did not explicitly set a DATA_SOURCE, take that one
    if (!process.env.DATA_SOURCE && dataSubdirectories.length === 1) {
      const assumedDataSource = dataSubdirectories[0]!.name;
      process.env.DATA_SOURCE = assumedDataSource;
      resolvedTarget = path.join(dataRoot, assumedDataSource);
    } else {
      abortStartup(`DATA_SOURCE '${resolvedTarget}' does not exist.`, 12);
    }
  }
  if (!fs.statSync(resolvedTarget).isDirectory()) {
    abortStartup(`DATA_SOURCE '${resolvedTarget}' is not a directory.`, 13);
  }

  return resolvedTarget;
}

function loadTracks(tracksPath: string): Track[] {
  if (!fs.existsSync(tracksPath)) {
    abortStartup(`Tracks file not found at ${tracksPath}.`, 20);
  }

  try {
    const tracksRaw = fs.readFileSync(tracksPath, 'utf-8');
    return JSON.parse(tracksRaw) as Track[];
  } catch (err) {
    abortStartup(`Error parsing JSON from ${tracksPath}: ${err}`, 21);
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

function setupFileWatcher(filePath: string, onFileChange: () => void, fileName: string): fs.FSWatcher | undefined {
  if (!fs.existsSync(filePath)) {
    return;
  }

  let changeTimeout: NodeJS.Timeout | null = null;

  return fs.watch(filePath, (_eventType, _filename) => {
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
  const instances: Record<string, GameInstance> = {};

  const projectRoot = path.dirname(fileURLToPath(import.meta.url));

  const activeDataDir = validateDataSource(projectRoot);
  console.log(`Loading server data from: ${activeDataDir}`);

  const tracksPath = getFilePath('tracks.json');
  const playlistsPath = getFilePath('playlists.json');
  const permissionsPath = getFilePath('permissions.json');

  // Cache the data in memory
  let cachedTracks = loadTracks(tracksPath);
  let cachedPlaylists = loadPlaylists(playlistsPath);

  // Watch for file changes and update cache
  const tracksWatcher = setupFileWatcher(
    tracksPath,
    () => {
      cachedTracks = loadTracks(tracksPath);
      server.emit('tracks-updated');
    },
    'Tracks'
  );

  const playlistsWatcher = setupFileWatcher(
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
      // Bind user ID to socket so it's available everywhere
      socket.data.userId = await validateToken(token);
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

  const musicPath = getFilePath('music');
  const gameCoverPath = getFilePath('game_covers');

  app.use('/music', express.static(musicPath));
  app.use('/game_covers', express.static(gameCoverPath));

  // Folder for serving temporary static files
  const tempDir = setupTempDir(projectRoot);
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
  app.get('/health', (_, res) => {
    res.status(200).json({ ok: true });
  });

  // Only register mock routes when server is started in mock mode
  if (isMockMode()) {
    console.log('[MODE] Server is running in mock mode');
    app.use('/api/test', setupMockRoutes(server, instances));
  }

  loadPermissions(permissionsPath);

  // Clean up file watchers on server shutdown
  httpServer.on('close', () => {
    tracksWatcher?.close();
    playlistsWatcher?.close();
  });

  return httpServer;
}
