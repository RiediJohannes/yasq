import fs from 'fs';

const DISCORD_API = "https://discord.com/api";

const isMockMode = () => process.env.VITE_MOCK_MODE === 'true';

export async function exchangeCodeForToken(code: string): Promise<string> {
  if (isMockMode() && code === "mock_code") {
    return "mock_token_for_dev";
  }

  const params = new URLSearchParams({
    client_id: process.env.VITE_DISCORD_CLIENT_ID || '',
    client_secret: process.env.DISCORD_CLIENT_SECRET || '',
    grant_type: "authorization_code",
    code: String(code),
  });

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
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
    const mockId = access_token.split("_")[1] || "0";
    return {
      id: mockId,
      username: `MockPlayer${mockId}`
    };
  }

  const response = await fetch(`${DISCORD_API}/v10/users/@me`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
  });
  return response.json();
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
  formData.append('payload_json', JSON.stringify({
    content: messageText,
  }));

  const response = await fetch(`${DISCORD_API}/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    },
    body: formData
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
      { id: '2', name: 'text channel 2', type: 0 }
    ];
  }

  const response = await fetch(`${DISCORD_API}/v10/guilds/${guildId}/channels`, {
    headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}` }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}