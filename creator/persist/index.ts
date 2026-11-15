import type { Plugin } from 'vite';

import { registerStaticMiddlewares } from './static.middleware';
import { registerUploadMiddleware } from './upload.middleware';
import { registerTracksMiddleware } from './tracks.middleware';
import { registerPlaylistsMiddleware } from './playlists.middleware';
import { registerSettingsMiddleware } from './settings.middleware';
import { registerPermissionsMiddleware } from './permissions.middleware';
import { registerDiscordUsersMiddleware } from './discordUsers.middleware';

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
      registerDiscordUsersMiddleware(server);
    },
  };
}
