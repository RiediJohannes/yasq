import fs from 'fs';
import path from 'path';
import { z } from 'zod';

import { GAME_COVERS_DIR, type Track, TRACK_AUDIO_DIR } from '@yasq/shared';

import { getFilePath, isMockMode } from '../utils/helper.js';
import { LogCategory, logger } from '../utils/logger.js';
import {
  formatListItemValidationIssue,
  type ListItemValidationIssue,
  resolveProperty,
  ValidationError,
} from './validate_config.js';

const trackSchema = z.object({
  game: z.string().nonempty(),
  title: z.string().nonempty(),

  audio: z
    .string()
    .nonempty()
    .refine(
      audioFilename => {
        const absolutePath = getFilePath(path.join(TRACK_AUDIO_DIR, audioFilename));
        return isMockMode() || fs.existsSync(absolutePath);
      },
      { error: 'Audio file does not exist in the designated track audio directory' }
    ),

  cover: z
    .string()
    .nonempty()
    .optional()
    .refine(
      coverFilename => {
        if (!coverFilename) return true;
        const absolutePath = getFilePath(path.join(GAME_COVERS_DIR, coverFilename));
        return isMockMode() || fs.existsSync(absolutePath);
      },
      { error: 'Cover file does not exist in the designated game covers directory' }
    ),

  tags: z
    .array(
      z.object({
        type: z.string().nonempty(),
        value: z.string().nonempty(),
      })
    )
    .optional(),
});

const trackListSchema = z.array(trackSchema);

/**
 * Loads tracks from a given JSON config path.
 * Checks that audio and optional cover files exist within their respective directories.
 * Throws a ValidationError if the file is missing, invalid JSON, or fails schema validation.
 */
export function loadTracks(configPath: string): Track[] {
  if (!fs.existsSync(configPath)) {
    throw new ValidationError(`Tracks file not found at '${configPath}'.`, 20);
  }

  let parsedConfig: unknown;
  try {
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    parsedConfig = JSON.parse(fileContent);
  } catch (err) {
    throw new ValidationError(`Error parsing JSON from ${configPath}: ${err}`, 21);
  }

  logger.debug(`Loading tracks from '${configPath}'.`, LogCategory.SETUP);

  const result = trackListSchema.safeParse(parsedConfig);

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
    const errorMessage =
      `Found ${issues.length} invalid configuration ${pluralized} in '${configPath}':\n` +
      issues.map(formatListItemValidationIssue).join('\n');
    throw new ValidationError(errorMessage, 22);
  }

  return result.data as Track[];
}
