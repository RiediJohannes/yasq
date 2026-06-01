import type { Server } from "socket.io";
import type { GameInstance } from "./models.js";
import { STATIC_FILES_DIR, TEMP_FILES_DIR, UI_UPDATES_DELAY_IN_E2E, WS_GAME_STATUS_UPDATE_EVENT } from "@yasq/shared";
import fs from "fs";
import path from "path";

const tokenCache = new Map<string, { userId: string, expires: number }>();
const TTL = 10 * 60 * 1000; // Cache for 10 minutes

export async function validateToken(token: string) {
  const now = Date.now();

  // 1. Check Cache First
  const cached = tokenCache.get(token);
  if (cached && cached.expires > now) {
    return cached.userId;
  }

  // 2. Check Mock Mode
  if (process.env.VITE_MOCK_MODE === 'true') {
    const mockId = token.split("_")[1] || "0";
    tokenCache.set(token, { userId: mockId, expires: now + TTL });
    return mockId;
  }

  // 3. Actual Discord Call
  try {
    const response = await fetch(`https://discord.com/api/users/@me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) return null;

    const discordUser = await response.json() as { id: string };
    const userId = discordUser.id;

    // Update Cache
    tokenCache.set(token, { userId, expires: now + TTL });
    return userId;
  } catch (error) {
    console.error("Discord Auth Error:", error);
    return null;
  }
}

export function invalidateToken(token: string) {
  return tokenCache.delete(token);
}

export function hash(str: string): number {
  let h: number = 0;
  for (let i = 0; i < str.length; i++) {
    h = 13 * h + 7 * str.charCodeAt(i);
    h &= 0xFFFFFFFF   // only keep lower 32 bits
  }
  return h & 0xFFFFFFFF
}

export function getGameStatusPayload(game: GameInstance) {
  return {
    state: game.state,
    hostId: game.hostId,
    readyUsers: [...game.readyUsers],
    guessedPlayers: [...game.guessedPlayers],
    currentRound: game.currentRound,
    isFinalRound: game.isFinalRound(),
    currentGame: game.currentGame,
    lastWinnerId: game.lastWinnerId,
    gameSettings: {
      ...game.settings,
      enabledJokers: [...game.settings.enabledJokers],
    }
  };
}

export function broadcastGameStatus(server: Server, instanceId: string, game: GameInstance) {
  const emitUpdate = () => {
    server.to(instanceId).emit(WS_GAME_STATUS_UPDATE_EVENT, getGameStatusPayload(game));
  };

  if (process.env.UI_TEST_MODE === 'true') {
    // Artificial delay so the UI tests can safely check for transient UI states
    setTimeout(emitUpdate, UI_UPDATES_DELAY_IN_E2E);
  } else {
    // Instantaneous updates during production and local mock debugging
    emitUpdate();
  }
}

export function setupTempDir(projectRootDir: string): string {
  const tempDir = path.join(projectRootDir, STATIC_FILES_DIR, TEMP_FILES_DIR);

  if (fs.existsSync(tempDir)) {
    // Clear any stale data inside the temp directory
    for (const entry of fs.readdirSync(tempDir)) {
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }
  } else {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  return tempDir
}