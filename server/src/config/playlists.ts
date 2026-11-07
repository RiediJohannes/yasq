import fs from 'fs';
import { z } from 'zod';

import { type Playlist, TRACK_AUDIO_DIR } from '@yasq/shared';

import { LogCategory, logger } from '../utils/logger.js';
import {
  fileExistsAtValidLocation,
  formatListItemValidationIssue,
  type ListItemValidationIssue,
  resolveProperty,
  ValidationError,
} from './validate_config.js';

const playlistSchema = z.object({
  name: z.string().nonempty(),
  tracks: z.array(
    z
      .string()
      .nonempty()
      .refine(...fileExistsAtValidLocation(TRACK_AUDIO_DIR))
  ),
});

const playlistListSchema = z.array(playlistSchema);

/**
 * Loads playlists from a given JSON config path.
 * Checks that audio files exist within their respective directories.
 * Throws a ValidationError if the file is missing, invalid JSON, or fails schema validation.
 */
export function loadPlaylists(configPath: string): Playlist[] {
  if (!fs.existsSync(configPath)) {
    throw new ValidationError(`Playlists file not found at '${configPath}'.`);
  }

  let parsedConfig: unknown;
  try {
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    parsedConfig = JSON.parse(fileContent);
  } catch (err) {
    throw new ValidationError(`Error parsing JSON from ${configPath}: ${err}`);
  }

  logger.debug(`Loading playlists from '${configPath}'.`, LogCategory.SETUP);

  const result = playlistListSchema.safeParse(parsedConfig);

  if (!result.success) {
    const issues: ListItemValidationIssue[] = [];

    for (const issue of result.error.issues) {
      const pathArr = issue.path;
      const itemIndex = typeof pathArr[0] === 'number' ? pathArr[0] + 1 : -1;
      const propertySubPath = pathArr.slice(1);
      const propertyPath = propertySubPath.length ? propertySubPath.join('.') : 'root';

      issues.push({
        itemIndex,
        propertyPath,
        errorMessage: issue.message,
        inputValue: resolveProperty(parsedConfig, pathArr),
      });
    }

    const pluralized = issues.length === 1 ? 'property' : 'properties';
    const warningMessage =
      `Found ${issues.length} invalid configuration ${pluralized} in playlists file '${configPath}':\n` +
      issues.map(formatListItemValidationIssue).join('\n');

    throw new ValidationError(warningMessage, 22);
  }

  return result.data as Playlist[];
}
