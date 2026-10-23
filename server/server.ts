import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import MockDate from 'mockdate';

import { setupCommonRoutes } from './routes/commonRoutes.js';
import { setupHostRoutes } from './routes/hostRoutes.js';
import { handleErrors, handleNotFound } from './routes/errors.js';
import { setMockState, setupMockRoutes } from './routes/mockRoutes.js';
import { GameInstance } from './src/models/game_instance.js';
import {
  broadcastGameStatus,
  getDataSourceDir,
  getFilePath,
  isMockMode,
  setServerRootDir,
  setupTempDir,
} from './src/utils/helper.js';
import {
  API_ROOT,
  GAME_COVERS_DIR,
  GameEvent,
  HOST_PREFIX,
  type Playlist,
  SAMPLE_DATA_DIR,
  STATIC_FILES_DIR,
  TEMP_FILES_DIR,
  TEST_PREFIX,
  type Track,
  TRACK_AUDIO_DIR,
} from '@yasq/shared';
import { loadPermissions } from './src/models/permissions.js';
import { loadDefaultGameSettings } from './src/models/settings.js';
import { setupWebsocketServer } from './src/socket_server.js';
import { LogCategory, logger } from './src/utils/logger.js';
import { loadTracks } from './src/models/tracks.js';
import type { ValidationError } from './src/utils/validate_config.js';
import { loadPlaylists } from './src/models/playlists.js';

dotenv.config({ path: '../.env' });

function abortStartup(message: string, exitCode: number): never {
  logger.error(`[FATAL] ${message}`, LogCategory.SETUP, null);
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
    logger.warn(
      `Detected multiple data sources in ${dataRoot}. To select a specific source, set the DATA_SOURCE environment variable.
      Falling back to '${SAMPLE_DATA_DIR}'.`,
      LogCategory.SETUP,
      null
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

function setupFileWatcher(filePath: string, onFileChange: () => void): fs.FSWatcher | undefined {
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
      } catch (err) {
        logger.error(`Error reloading ${filePath}:`, LogCategory.SETUP, null, err as Error);
      }
    }, 100);
  });
}

function loadMockState(instances: Record<string, GameInstance>) {
  const stateFile = process.env.MOCK_STATE;
  if (!stateFile) return;

  try {
    const absolutePath = path.resolve(process.cwd(), stateFile);
    if (!fs.existsSync(absolutePath)) {
      logger.error(`Mock state file not found at ${absolutePath}`, LogCategory.SETUP, null);
      return;
    }

    const rawData = fs.readFileSync(absolutePath, 'utf-8');
    const stateData = JSON.parse(rawData);

    const game = setMockState(stateData);

    instances[game.instanceId] = game;

    logger.info(`[MOCK] Pre-loaded game state from ${stateFile}`, LogCategory.SETUP, game.instanceId);
  } catch (err) {
    logger.error('[MOCK] Error loading mock game state:', LogCategory.SETUP, null, err as Error);
  }
}

export function setupServer() {
  const instances: Record<string, GameInstance> = {};

  if (isMockMode()) {
    MockDate.set('2026-02-01T12:00:00.000Z');
    loadMockState(instances);
  }

  const projectRoot = path.dirname(fileURLToPath(import.meta.url));
  setServerRootDir(projectRoot);

  const activeDataDir = validateDataSource(projectRoot);
  logger.info(`Loading server data from: '${activeDataDir}'`, LogCategory.SETUP);

  const tracksPath = getFilePath('tracks.json');
  const playlistsPath = getFilePath('playlists.json');
  const permissionsPath = getFilePath('permissions.json');
  const settingsPath = getFilePath('settings.json');

  // Cache the data in memory
  let cachedTracks: Track[];
  try {
    cachedTracks = loadTracks(tracksPath);
    logger.info(`✓ Tracks loaded: ${cachedTracks.length} total`, LogCategory.SETUP);
  } catch (error) {
    const err = error as ValidationError;
    abortStartup(err.message, err.exitCode ?? 1);
  }

  let cachedPlaylists: Playlist[];
  try {
    cachedPlaylists = loadPlaylists(playlistsPath);
    logger.info(`✓ Playlists loaded: ${cachedPlaylists.length} total`, LogCategory.SETUP);
  } catch (error) {
    cachedPlaylists = [];
    const err = error as ValidationError;
    logger.warn(`${err.message}\nSkipping playlist loading.`, LogCategory.SETUP, null);
  }

  try {
    loadPermissions(permissionsPath);
    logger.info(`✓ Permissions loaded successfully`, LogCategory.SETUP);
  } catch (error) {
    const err = error as ValidationError;
    logger.warn(`${err.message}\nSkipping permissions loading.`, LogCategory.SETUP, null);
  }

  loadDefaultGameSettings(settingsPath);

  const app = express();
  const httpServer = createServer(app);
  const socketServer = setupWebsocketServer(httpServer, instances);

  // Watch for file changes and update cache
  const tracksWatcher = setupFileWatcher(tracksPath, () => {
    try {
      const previousTracks = cachedTracks ?? [];
      cachedTracks = loadTracks(tracksPath);
      socketServer.emit(GameEvent.TRACKS_UPDATED);

      // Count how many tracks differ from the previous cache
      const previousSet = new Set(previousTracks.map(t => JSON.stringify(t)));
      const changedCount = cachedTracks.filter(t => !previousSet.has(JSON.stringify(t))).length;

      logger.info(`✓ Tracks reloaded: ${cachedTracks.length} total, ${changedCount} changed/new`, LogCategory.SETUP);
    } catch (error) {
      const err = error as ValidationError;
      logger.error(
        `Error reloading tracks: ${err.message}\nKeeping previous track cache (${cachedTracks.length} tracks).`,
        LogCategory.SETUP,
        null
      );
    }
  });

  const playlistsWatcher = setupFileWatcher(playlistsPath, () => {
    try {
      const previousPlaylists = cachedPlaylists ?? [];
      cachedPlaylists = loadPlaylists(playlistsPath);
      socketServer.emit(GameEvent.PLAYLISTS_UPDATED);

      // Count how many playlists differ from the previous cache
      const previousSet = new Set(previousPlaylists.map(t => JSON.stringify(t)));
      const changedCount = cachedPlaylists.filter(t => !previousSet.has(JSON.stringify(t))).length;

      logger.info(
        `✓ Playlists reloaded: ${cachedPlaylists.length} total, ${changedCount} changed/new`,
        LogCategory.SETUP
      );
    } catch (error) {
      const err = error as ValidationError;
      logger.warn(
        `Error reloading playlists: ${err.message}\nKeeping previous playlists cache (${cachedPlaylists.length} playlists).`,
        LogCategory.SETUP,
        null
      );
    }
  });

  const permissionsWatcher = setupFileWatcher(permissionsPath, () => {
    try {
      loadPermissions(permissionsPath);
      logger.info(`✓ Permissions reloaded successfully`, LogCategory.SETUP);
    } catch (error) {
      const err = error as ValidationError;
      logger.warn(
        `Error reloading permissions: ${err.message}\nKeeping previous permissions configuration.`,
        LogCategory.SETUP,
        null
      );
    }
  });

  const settingsWatcher = setupFileWatcher(settingsPath, () => {
    loadDefaultGameSettings(settingsPath);
  });

  // Allow express to parse JSON bodies
  app.use(express.json());

  const musicPath = getFilePath(TRACK_AUDIO_DIR);
  const gameCoverPath = getFilePath(GAME_COVERS_DIR);

  app.use(`/${TRACK_AUDIO_DIR}`, express.static(musicPath));
  app.use(`/${GAME_COVERS_DIR}`, express.static(gameCoverPath));

  // Folder for serving temporary static files
  const tempDir = setupTempDir(projectRoot);
  app.use(`/${TEMP_FILES_DIR}`, express.static(tempDir));

  // Register routes for REST communication between clients and server
  // Pass callbacks to retrieve cached data and trigger game update events
  app.use(
    `/${API_ROOT}`,
    setupCommonRoutes(instances, () => cachedTracks)
  );
  app.use(
    `/${API_ROOT}/${HOST_PREFIX}`,
    setupHostRoutes(
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
    logger.info('[MODE] Server is running in mock mode', LogCategory.SETUP);
    app.use(
      `/${API_ROOT}/${TEST_PREFIX}`,
      setupMockRoutes(instances, (updatedGame: GameInstance) => broadcastGameStatus(socketServer, updatedGame))
    );
  }

  // These routes MUST be added last
  app.use(handleNotFound);
  app.use(handleErrors);

  // Clean up file watchers on server shutdown
  httpServer.on('close', () => {
    tracksWatcher?.close();
    playlistsWatcher?.close();
    permissionsWatcher?.close();
    settingsWatcher?.close();
  });

  return httpServer;
}
