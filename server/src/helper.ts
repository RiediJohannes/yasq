import type { Server } from "socket.io";
import fs from "fs";
import path from "path";
import { ChannelType, type APIChannel, type APITextChannel } from "discord-api-types/v10";

import type { GameInstance } from "./models.js";
import { STATIC_FILES_DIR, TEMP_FILES_DIR, UI_UPDATES_DELAY_IN_E2E, WS_GAME_STATUS_UPDATE_EVENT, type Participant } from "@yasq/shared";
import { getDiscordUser } from "./utils/discord.js";

const tokenCache = new Map<string, { userId: string, expires: number }>();
const TTL = 10 * 60 * 1000; // Cache for 10 minutes

export const userDataCache = new Map<string, Participant>();

export async function validateToken(token: string) {
  const now = Date.now();

  // 1. Check Cache First
  const cached = tokenCache.get(token);
  if (cached && cached.expires > now) {
    return cached.userId;
  }

  // 2. Actual Discord Call
  try {
    const discordUser = await getDiscordUser(token) as Participant;
    if (!discordUser || !discordUser.id) return null;

    const userId = discordUser.id;
    const profile: Participant = {
      id: userId,
      username: discordUser.username,
      ...(discordUser.nickname && { nickname: discordUser.nickname }),
      ...(discordUser.global_name && { global_name: discordUser.global_name }),
      ...(discordUser.avatar && { avatar: discordUser.avatar }),
    };

    // Update Cache
    tokenCache.set(token, { userId, expires: now + TTL });
    userDataCache.set(userId, profile);
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
    currentGame: game.currentGame,
    lastWinnerId: game.lastWinnerId,
    streaks: game.streaks,
    lostStreaks: game.currentRoundLostStreaks,
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

export function filterDiscordTextChannels(channels: APIChannel[]) {
  // 1. Create a map of all categories
  const categoryMap = new Map();
  channels.filter(c => c.type === ChannelType.GuildCategory).forEach(c => categoryMap.set(c.id, c.name));

  // 2. Filter text channels and inject the category name
  const textChannels = channels
    .filter((c: APIChannel) => c.type === ChannelType.GuildText)
    .map((c: APITextChannel) => ({
      id: c.id,
      name: c.name,
      category: c.parent_id ? categoryMap.get(c.parent_id) : ""
    }))
    .sort((a, b) => {
      // Compare categories first
      const categoryCompare = a.category.localeCompare(b.category);
      if (categoryCompare !== 0) return categoryCompare;

      // If categories are the same, compare channel names
      return a.name.localeCompare(b.name);
    });

  return textChannels;
}