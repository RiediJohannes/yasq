import fs from 'fs';
import path from 'path';
import { z } from 'zod';

import {
  AchievementBonusMode,
  AchievementBonusType,
  APP_SOUNDS_DIR,
  type AppSettings,
  DEFAULT_APP_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  DEFAULT_SETTINGS,
  FirstBonusMultiplier,
  GameSettings,
  Joker,
  StreakBonusMultiplier,
  TimeBonus,
} from '@yasq/shared';

import { getFilePath, isMockMode } from '../utils/helper.js';
import { LogCategory, logger } from '../utils/logger.js';
import { formatPropertyValidationIssue, type PropertyValidationIssue, resolveProperty } from './validate_config.js';

let issues: PropertyValidationIssue[] = [];
let userDefinedGameSettings: GameSettings<Set<Joker>> | null = null;
let userDefinedAppSettings: AppSettings | null = null;

/**
 * Loads the default settings of any new {@link GameInstance} from a given config file. Upon passing validation,
 * the settings are exposed globally via the {@link getDefaultGameSettings} function.
 */
export function loadSettingsConfig(configPath: string): GameSettings<Set<Joker>> {
  const settings = readSettings(configPath);

  userDefinedGameSettings = {
    ...settings.gameSettings,
    enabledJokers: new Set(settings.gameSettings.enabledJokers),
  };
  userDefinedAppSettings = settings.appSettings;

  return userDefinedGameSettings;
}

/**
 * Returns the default settings that shall be applied to any new {@link GameInstance} based on hard-coded defaults,
 * optionally overridden by a user-defined settings config applied through {@link loadSettingsConfig}.
 */
export function getDefaultGameSettings(): GameSettings<Set<Joker>> {
  const baseSettings = userDefinedGameSettings ?? {
    ...DEFAULT_GAME_SETTINGS,
    enabledJokers: new Set(DEFAULT_GAME_SETTINGS.enabledJokers),
  };

  return structuredClone(baseSettings);
}

export function getAppSettings(): AppSettings {
  const appSettings = userDefinedAppSettings ?? DEFAULT_APP_SETTINGS;
  return structuredClone(appSettings);
}

const fallbackWithWarning = <T>(propertyName: string, fallback: T) => {
  return (ctx: z.core.$ZodCatchCtx): T => {
    for (const [idx, issue] of ctx.issues.entries()) {
      // Missing property in the JSON config (not an issue)
      if (issue.input === undefined) {
        continue;
      }

      const nestedPropertyPath = issue.path?.length ? issue.path : undefined;
      const propertyPath = nestedPropertyPath ? `${propertyName}.${nestedPropertyPath.join('.')}` : propertyName;
      const errorMessage = issue.message ?? ctx.error?.issues?.[idx]?.message ?? 'Unknown error';

      issues.push({
        propertyPath,
        errorMessage,
        inputValue: resolveProperty(issue.input, nestedPropertyPath),
        fallbackValue: resolveProperty(fallback, nestedPropertyPath),
      });
    }

    return fallback;
  };
};

const soundFileExists = (propertyName: string) =>
  [
    (fileName: string) => {
      const absolutePath = getFilePath(path.join(APP_SOUNDS_DIR, fileName));
      return isMockMode() || fs.existsSync(absolutePath);
    },
    {
      error: `File for '${propertyName}' does not exist in the designated sound directory ('${APP_SOUNDS_DIR}')`,
    },
  ] as const;

namespace Schemas {
  const gameSettingsSchema = z.object({
    rounds: z.number().int().positive().catch(fallbackWithWarning('rounds', DEFAULT_GAME_SETTINGS.rounds)),
    maxGuessTime: z
      .number()
      .int()
      .positive()
      .catch(fallbackWithWarning('maxGuessTime', Math.round(DEFAULT_GAME_SETTINGS.maxGuessTime / 1000)))
      .transform(timeSeconds => timeSeconds * 1000),
    enabledJokers: z
      .array(z.enum(Joker))
      .catch(fallbackWithWarning('enabledJokers', DEFAULT_GAME_SETTINGS.enabledJokers)),
    firstBonusMultiplier: z
      .enum(FirstBonusMultiplier)
      .catch(fallbackWithWarning('firstBonusMultiplier', DEFAULT_GAME_SETTINGS.firstBonusMultiplier)),
    timeBonus: z
      .union([z.enum(TimeBonus), z.literal('off')])
      .nullable()
      .transform(val => (val === 'off' ? null : val))
      .catch(fallbackWithWarning('timeBonus', DEFAULT_GAME_SETTINGS.timeBonus)),
    streakBonusMultiplier: z
      .enum(StreakBonusMultiplier)
      .catch(fallbackWithWarning('streakBonusMultiplier', DEFAULT_GAME_SETTINGS.streakBonusMultiplier)),
    achievementBonuses: z
      .preprocess(
        val => (val === 'off' ? null : val),
        z
          .discriminatedUnion('mode', [
            z.object({ mode: z.literal('off') }).transform(() => null),
            z.object({
              mode: z.literal(AchievementBonusMode.MANUAL),
              enabledTypes: z.array(z.enum(AchievementBonusType)),
            }),
            z.object({
              mode: z.literal(AchievementBonusMode.RANDOM),
              randomCount: z
                .number()
                .int()
                .positive()
                .lt(Object.keys(AchievementBonusType).length, {
                  error: `'randomCount' must be smaller than the total number of available achievement bonus types (${Object.keys(AchievementBonusType).length})`,
                }),
            }),
          ])
          .nullable()
      )
      .catch(fallbackWithWarning('achievementBonuses', DEFAULT_GAME_SETTINGS.achievementBonuses)),
  });

  const appSoundsSchema = z.object({
    sounds: z
      .object({
        finalResultsJingle: z
          .string()
          .nonempty()
          .refine(...soundFileExists('finalResultsJingle'))
          .nullish(),
        finalResultsLoop: z
          .string()
          .nonempty()
          .refine(...soundFileExists('finalResultsLoop'))
          .nullish(),
      })
      .catch(fallbackWithWarning('sounds', DEFAULT_APP_SETTINGS.sounds)),
  });

  export const fullSettingsSchema = z.object({
    gameSettings: gameSettingsSchema.readonly().catch(DEFAULT_GAME_SETTINGS),
    appSettings: appSoundsSchema.readonly().catch(DEFAULT_APP_SETTINGS),
  });
}

type Settings = z.infer<typeof Schemas.fullSettingsSchema>;

/**
 * Parses the configurable settings from a JSON file at the given path and validates the contents against
 * the schema of {@link Settings}.
 */
function readSettings(configPath: string): Settings {
  if (!fs.existsSync(configPath)) {
    logger.info(
      `No settings config found at '${configPath}'. Initializing app with default settings.`,
      LogCategory.SETUP
    );
    return DEFAULT_SETTINGS;
  }

  try {
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const parsedConfig = JSON.parse(fileContent);

    issues = [];
    const validatedSettings = Schemas.fullSettingsSchema.parse(parsedConfig);

    logger.debug(`Loading settings from '${configPath}'.`, LogCategory.SETUP);

    if (issues.length > 0) {
      const pluralized = issues.length === 1 ? 'property' : 'properties';
      const warningMessage =
        `Found ${issues.length} invalid configuration ${pluralized} in '${configPath}':\n` +
        issues.map(formatPropertyValidationIssue).join('\n');
      logger.warn(warningMessage, LogCategory.SETUP, null);
    }

    return validatedSettings;
  } catch (error) {
    logger.error(
      `Failed to parse app settings from '${configPath}'. Falling back to default settings.`,
      LogCategory.SETUP,
      null,
      error instanceof Error ? error : String(error)
    );
  }

  return DEFAULT_SETTINGS;
}
