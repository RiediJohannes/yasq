import dotenv from 'dotenv';
import path from 'path';

import { STATIC_FILES_DIR, TRACK_AUDIO_DIR, GAME_COVERS_DIR, APP_SOUNDS_DIR } from '@yasq/shared';

dotenv.config({ path: '../.env' });

export const isTest = process.env.NODE_ENV === 'test';

export const baseDir = isTest
  ? path.resolve(process.cwd(), '../tests/creator/data')
  : path.resolve(process.cwd(), '../server', STATIC_FILES_DIR, process.env.DATA_SOURCE || 'creator');

export const paths = {
  baseDir,
  tracksFile: path.join(baseDir, 'tracks.json'),
  playlistsFile: path.join(baseDir, 'playlists.json'),
  permissionsFile: path.join(baseDir, 'permissions.json'),
  settingsFile: path.join(baseDir, 'settings.json'),
  musicDir: path.join(baseDir, TRACK_AUDIO_DIR),
  coversDir: path.join(baseDir, GAME_COVERS_DIR),
  soundsDir: path.join(baseDir, APP_SOUNDS_DIR),
};
