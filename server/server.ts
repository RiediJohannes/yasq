import express from "express";
import dotenv from "dotenv";
import path from "path";
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from "http";
import { Server } from "socket.io";

import { GameInstance } from './src/models.js';

import { setupRoutes } from "./routes/routes.js";
import { setupMockRoutes } from "./routes/mockRoutes.js";
import { getGameStatusPayload, invalidateToken, setupTempDir, validateToken } from "./src/helper.js";
import { STATIC_FILES_DIR, TEMP_FILES_DIR, WS_GAME_STATUS_UPDATE_EVENT, WS_JOIN_INSTANCE_EVENT } from "@yasq/shared";

dotenv.config({ path: "../.env" });

const isMockMode = process.env.VITE_MOCK_MODE === 'true'
const instances: Record<string, GameInstance> = {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tracksPath = isMockMode
  ? path.join(__dirname, '..', 'mock_data', 'mockTracks.json')
  : path.join(__dirname, STATIC_FILES_DIR, 'tracks.json');

let allTracks = [];

if (fs.existsSync(tracksPath)) {
  try {
    const tracksRaw = fs.readFileSync(tracksPath, 'utf-8');
    allTracks = JSON.parse(tracksRaw);
  } catch (err) {
    console.error(`Error parsing JSON from ${tracksPath}:`, err);
    process.exit(1);
  }
} else {
  console.error(`Tracks file not found at ${tracksPath}.`);
  process.exit(1);
}

const playlistsPath = isMockMode
  ? path.join(__dirname, '..', 'mock_data', 'mockPlaylists.json')
  : path.join(__dirname, STATIC_FILES_DIR, 'playlists.json');

let allPlaylists = [];

if (fs.existsSync(playlistsPath)) {
  try {
    const playlistsRaw = fs.readFileSync(playlistsPath, 'utf-8');
    allPlaylists = JSON.parse(playlistsRaw);
  } catch (err) {
    console.error(`Error parsing JSON from ${playlistsPath}:`, err);
  }
} else {
  console.log(`Playlists file not found at ${playlistsPath}. Starting with no playlists.`);
}


const app = express();

const httpServer = createServer(app);
const server = new Server(httpServer, { cors: { origin: "*" } });

server.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Missing token"));

  try {
    const userId = await validateToken(token);

    // Bind it to the socket so it's available everywhere
    socket.data.userId = userId;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

server.on('connection', (socket) => {
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

    server.to(instanceId).emit(WS_GAME_STATUS_UPDATE_EVENT, getGameStatusPayload(game));
  });

  socket.on('disconnect', () => {
    const { userId, instanceId } = socket.data;
    if (!userId || !instanceId) return;

    const game = instances[instanceId];
    if (!game) return;

    game.registeredUsers.delete(userId);

    invalidateToken(socket.handshake.auth.token);

    if (game.isHost(userId)) {
      const isGameActive = game.pickNewHost();

      if (!isGameActive) {
        console.log(`Terminating empty instance: ${instanceId}`);
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
app.use('/api', setupRoutes(server, instances, isMockMode, allTracks, allPlaylists));

// Add a simple endpoint for health checks
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

// Only register mock routes when server is started in mock mode
if (isMockMode) {
  console.log('[MODE] Server is running in mock mode')
  app.use('/api/test', setupMockRoutes(server, instances));
}

const port = 3001;
httpServer.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
