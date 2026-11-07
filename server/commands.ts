import dotenv from 'dotenv';
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  EntryPointCommandHandlerType,
  REST,
  Routes,
} from 'discord.js';
import { LogCategory, logger } from './src/utils/logger.js';

dotenv.config({ path: '../.env' });

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.VITE_DISCORD_CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  logger.error('Error: Missing DISCORD_BOT_TOKEN or VITE_DISCORD_CLIENT_ID in .env file.', LogCategory.SETUP, null);
  process.exit(1);
}

const primaryEntryPointCommand = {
  name: 'Launch YASQ',
  description: 'Launch a new Game of YASQ!',
  type: ApplicationCommandType.PrimaryEntryPoint,
  handler: EntryPointCommandHandlerType.DiscordLaunchActivity,
};

const chatCommands = [
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

const commands = [primaryEntryPointCommand, ...chatCommands];
const rest = new REST({ version: '10' }).setToken(TOKEN);

const shouldDeregister = process.argv.includes('--deregister');

(async () => {
  try {
    if (shouldDeregister) {
      logger.debug('Deregistering chat commands (preserving Primary Entry Point)...', LogCategory.SETUP);
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [primaryEntryPointCommand] });
      logger.info('Successfully deregistered global YASQ chat commands.', LogCategory.SETUP);
    } else {
      logger.debug('Registering global YASQ commands...', LogCategory.SETUP);
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      logger.info('Successfully registered global YASQ commands.', LogCategory.SETUP);
    }
  } catch (err) {
    const action = shouldDeregister ? 'deregister' : 'register';
    logger.error(`Failed to ${action} global YASQ commands.`, LogCategory.SETUP, null, err as Error);
  }
})();
