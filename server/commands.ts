import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';
import { ApplicationCommandOptionType, ApplicationCommandType, EntryPointCommandHandlerType } from 'discord.js';

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
  {
    name: 'test',
    description: 'Test Command',
    type: ApplicationCommandType.ChatInput,
  },
  {
    name: 'top',
    description: 'View the top 5 YASQ players',
    type: ApplicationCommandType.ChatInput,
  },
  {
    name: 'rank',
    description: 'View your YASQ rank',
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        name: 'player',
        description: "Check another player's rank (optional)",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
    ],
  },
  {
    name: 'play',
    description: 'Play your favourite YASQ track',
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        name: 'track',
        description: 'Search by track title or game name',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: 'playlist',
    description: 'Play your favourite YASQ playlist',
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        name: 'name',
        description: 'Search by playlist',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
  {
    name: 'skip',
    description: 'Skip current track on YASQ playlist',
    type: ApplicationCommandType.ChatInput,
  },
  {
    name: 'leave',
    description: 'Kick the bot out of the voice channel',
    type: ApplicationCommandType.ChatInput,
  },
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Registering global YASQ commands...');

    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

    console.log('Successfully registered global YASQ commands.');
  } catch (error) {
    console.error(error);
  }
})();
