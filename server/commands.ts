import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';
import { ApplicationCommandType, EntryPointCommandHandlerType } from 'discord.js';

dotenv.config({ path: '../.env' });

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.VITE_DISCORD_CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('Error: Missing DISCORD_BOT_TOKEN or VITE_DISCORD_CLIENT_ID in .env file.');
  process.exit(1);
}

const commands = [
  {
    name: 'Launch YASQ',
    description: 'Launch a new Game of YASQ!',
    type: ApplicationCommandType.PrimaryEntryPoint,
    handler: EntryPointCommandHandlerType.DiscordLaunchActivity,
  },
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Registering global Entry Point command...');

    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

    console.log('Successfully registered global Entry Point command.');
  } catch (error) {
    console.error(error);
  }
})();
