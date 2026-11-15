import { Client, Events, GatewayIntentBits } from 'discord.js';
import { Connect } from 'vite';
import http from 'http';
import { getAvatarUrl, Participant } from '@yasq/shared';

interface DiscordGuildSummary {
  id: string;
  name: string;
}

interface DiscordUserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

interface DiscordGuildMember {
  nick: string | null;
  user: {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
  };
}

async function fetchGuildMembers(guildId: string, botToken: string): Promise<DiscordUserSummary[]> {
  const users: DiscordUserSummary[] = [];
  let after = '';

  while (true) {
    const url = new URL(`https://discord.com/api/v10/guilds/${guildId}/members`);
    url.searchParams.set('limit', '1000');
    if (after) url.searchParams.set('after', after);

    let response: Response;
    let retries = 0;
    while (true) {
      response = await fetch(url, {
        headers: { Authorization: `Bot ${botToken}` },
      });

      if (response.status !== 429) break;
      if (retries >= 5) {
        throw new Error('Discord rate limit persisted while loading server members.');
      }

      const retryAfter = Number(response.headers.get('retry-after'));
      if (!Number.isFinite(retryAfter) || retryAfter < 0) {
        throw new Error('Discord returned an invalid rate-limit retry delay.');
      }

      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      retries++;
    }

    if (!response.ok) {
      throw new Error(`Discord member list failed (${response.status}): ${await response.text()}`);
    }

    const members = (await response.json()) as DiscordGuildMember[];
    users.push(
      ...members.map(({ nick, user }) => ({
        id: user.id,
        username: user.username,
        displayName: nick || user.global_name || user.username,
        avatarUrl: getAvatarUrl(user as Participant),
      }))
    );

    if (members.length < 1000) break;
    after = members[members.length - 1]!.user.id;
  }

  users.sort((first, second) => first.displayName.localeCompare(second.displayName));
  return users;
}

export function registerDiscordUsersMiddleware(server: { middlewares: Connect.Server }) {
  let clientPromise: Promise<Client> | undefined;

  const getClient = (): Promise<Client> => {
    if (clientPromise) return clientPromise;

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) return Promise.reject(new Error('DISCORD_BOT_TOKEN is not configured.'));

    const client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });

    clientPromise = new Promise<Client>((resolve, reject) => {
      client.once(Events.ClientReady, readyClient => resolve(readyClient));
      void client.login(botToken).catch(reject);
    });

    return clientPromise;
  };

  server.middlewares.use('/api/discord-guilds', async (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'GET') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: `Method ${req.method} not allowed` }));
    }

    try {
      const client = await getClient();
      const guilds: DiscordGuildSummary[] = [...client.guilds.cache.values()].map(({ id, name }) => ({ id, name }));
      return res.end(JSON.stringify(guilds));
    } catch (error) {
      console.error('Failed to load Discord guilds:', error);
      res.statusCode = 503;
      return res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Discord bot is unavailable.' }));
    }
  });

  server.middlewares.use('/api/discord-users', async (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'GET') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: `Method ${req.method} not allowed` }));
    }

    const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
    const guildId = params.get('guildId')?.trim() ?? '';
    if (!/^\d{1,20}$/.test(guildId)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'A valid Discord guild ID is required.' }));
    }

    try {
      const client = await getClient();
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: 'Discord server not found for this bot.' }));
      }

      const botToken = process.env.DISCORD_BOT_TOKEN;
      if (!botToken) {
        res.statusCode = 503;
        return res.end(JSON.stringify({ error: 'DISCORD_BOT_TOKEN is not configured.' }));
      }

      const users = await fetchGuildMembers(guildId, botToken);
      return res.end(JSON.stringify(users));
    } catch (error) {
      console.error('Failed to load Discord guild members:', error);
      res.statusCode = 502;
      return res.end(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to load server members.' })
      );
    }
  });

  server.middlewares.use('/api/discord-user-profiles', async (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'GET') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: `Method ${req.method} not allowed` }));
    }

    const ids = new URL(req.url ?? '/', 'http://localhost').searchParams.getAll('id');
    if (ids.length > 100 || ids.some(id => !/^\d{1,20}$/.test(id))) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Provide up to 100 valid Discord user IDs.' }));
    }

    try {
      const client = await getClient();
      const users = await Promise.all(
        [...new Set(ids)].map(async id => {
          const user = await client.users.fetch(id);
          return {
            id: user.id,
            username: user.username,
            displayName: user.globalName || user.username,
            avatarUrl: user.avatarURL({ size: 64 }) || user.defaultAvatarURL,
          };
        })
      );
      return res.end(JSON.stringify(users));
    } catch (error) {
      console.error('Failed to load Discord user profiles:', error);
      res.statusCode = 502;
      return res.end(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to load Discord user profiles.' })
      );
    }
  });
}
