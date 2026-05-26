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
import { getGameStatusPayload } from "./src/helper.js";
import { WS_GAME_STATUS_UPDATE_EVENT, WS_JOIN_INSTANCE_EVENT } from "@yasq/shared";

dotenv.config({ path: "../.env" });

const isMockMode = process.env.VITE_MOCK_MODE === 'true'
const instances: Record<string, GameInstance> = {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tracksPath = isMockMode
  ? path.join(__dirname, '..', 'mock_data', 'mockTracks.json')
  : path.join(__dirname, 'data', 'tracks.json');

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
  : path.join(__dirname, 'data', 'playlists.json');

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

server.on('connection', (socket) => {
  socket.on(WS_JOIN_INSTANCE_EVENT, ({ instanceId }) => {
    socket.join(instanceId);
    // Send them the current state immediately upon joining
    let game = instances[instanceId];
    if (game) {
      socket.emit(WS_GAME_STATUS_UPDATE_EVENT, getGameStatusPayload(game));
    }
  });
});

// Allow express to parse JSON bodies
app.use(express.json());
app.use('/music', express.static(path.join(__dirname, 'data/music')));
app.use('/game_covers', express.static(path.join(__dirname, 'data/game_covers')));

// Register routes
app.use('/api', setupRoutes(server, instances, isMockMode, allTracks, allPlaylists));

// Only register mock routes when server is started in mock mode
if (isMockMode) {
  console.log('[MODE] Server is running in mock mode')
  app.use('/api/test', setupMockRoutes(server, instances));
}

const port = 3001;
httpServer.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
