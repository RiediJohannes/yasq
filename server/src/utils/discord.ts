import fs from 'fs';

import type { Participant } from '@yasq/shared';

import { isMockMode } from './helper.js';
import { LogCategory, logger } from './logger.js';

const DISCORD_API = 'https://discord.com/api';

export function extractGuildIdFromInstanceId(instanceId: string): string | null {
  const match = instanceId.match(/-gc-([0-9]+)/);
  return match?.[1] ?? null;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  if (isMockMode() && code === 'mock_code') {
    return 'mock_token_for_dev';
  }

  const params = new URLSearchParams({
    client_id: process.env.VITE_DISCORD_CLIENT_ID || '',
    client_secret: process.env.DISCORD_CLIENT_SECRET || '',
    grant_type: 'authorization_code',
    code: String(code),
  });

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export async function getDiscordUser(access_token: string) {
  if (isMockMode()) {
    const mockId = access_token.split('_')[1] || '0';
    return {
      id: mockId,
      username: `MockPlayer${mockId}`,
    };
  }

  const response = await fetch(`${DISCORD_API}/v10/users/@me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.json();
}

export async function enrichParticipantsWithGuildNicknames(
  participants: Participant[],
  instanceId: string
): Promise<void> {
  if (isMockMode()) {
    return;
  }

  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!BOT_TOKEN) {
    logger.warn('DISCORD_BOT_TOKEN not set. Can not fetch guild nicknames.', LogCategory.DISCORD, instanceId);
    return;
  }
  const match = instanceId.match(/-gc-([0-9]+)/);
  const guildId = match ? match[1] : null;

  if (!guildId || participants.length === 0) return;

  try {
    // Fetch the list of members from the guild (Discord has a limit of 1000 users per query)
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`, {
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to fetch guild user data.', LogCategory.DISCORD, instanceId, errorText);
      return;
    }

    const members = await response.json();
    const nicknameMap = new Map<string, string>();

    for (const member of members) {
      const displayName = member.nick || member.user.global_name || member.user.username;
      nicknameMap.set(member.user.id, displayName);
    }

    // Update each participant's nickname if found
    for (const p of participants) {
      if (nicknameMap.has(p.id)) {
        const newNickname = nicknameMap.get(p.id);
        if (newNickname) {
          p.nickname = newNickname;
        }
      }
    }
  } catch (err) {
    logger.error('Failed to fetch guild nicknames for results image:', LogCategory.DISCORD, null, err as Error);
  }
}

export async function postResultsToChannel(
  channelId: string,
  messageText: string,
  filePath: string,
  instanceId: string
) {
  if (isMockMode()) {
    return { success: true };
  }

  const fileBuffer = fs.readFileSync(filePath);
  const fileBlob = new Blob([fileBuffer], { type: 'image/png' });

  const formData = new FormData();
  formData.append('files[0]', fileBlob, `results-${instanceId}.png`);
  formData.append(
    'payload_json',
    JSON.stringify({
      content: messageText,
    })
  );

  const response = await fetch(`${DISCORD_API}/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getChannelsForGuild(guildId: string) {
  if (isMockMode()) {
    return [
      { id: '1', name: 'text channel 1', type: 0 },
      { id: '2', name: 'text channel 2', type: 0 },
    ];
  }

  const response = await fetch(`${DISCORD_API}/v10/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
