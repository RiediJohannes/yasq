import type { Plugin } from 'vite';

import { registerStaticMiddlewares } from './static.middleware';
import { registerUploadMiddleware } from './upload.middleware';
import { registerTracksMiddleware } from './tracks.middleware';
import { registerPlaylistsMiddleware } from './playlists.middleware';
import { registerSettingsMiddleware } from './settings.middleware';
import { registerPermissionsMiddleware } from './permissions.middleware';
import { registerDiscordMiddleware } from './discord.middleware';

export function persistPlugin(): Plugin {
  return {
    name: 'persist',
    configureServer(server) {
      registerStaticMiddlewares(server);
      registerUploadMiddleware(server);
      registerTracksMiddleware(server);
      registerPlaylistsMiddleware(server);
      registerSettingsMiddleware(server);
      registerPermissionsMiddleware(server);
      registerDiscordMiddleware(server);
    },
  };
}
