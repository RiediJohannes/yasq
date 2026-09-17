import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import { initDatabase } from './db.js';

dotenv.config({ path: '../.env' });

export async function startDiscordBot() {
  await initDatabase().catch(err => console.error('Database init error:', err));

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once('clientReady', () => {
    console.log(`Bot logged in as ${client.user?.tag}`);
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'test') {
      try {
        const username = interaction.user.username;
        await interaction.reply(`hallo, ${username}!`);
      } catch (error) {
        console.error('Failed to reply:', error);
      }
    }
  });

  client.login(process.env.DISCORD_BOT_TOKEN);
}
