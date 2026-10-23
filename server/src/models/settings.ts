import fs from 'fs';
import { z } from 'zod';
import {
  AchievementBonusMode,
  AchievementBonusType,
  DEFAULT_SETTINGS,
  FirstBonusMultiplier,
  GameSettings,
  Joker,
  StreakBonusMultiplier,
  TimeBonus,
} from '@yasq/shared';
import { stringify } from '../utils/helper.js';
import { LogCategory, logger } from '../utils/logger.js';

interface FallbackWarning {
  propertyPath: string;
  errorMessage: string;
  inputValue: unknown;
  fallbackValue: unknown;
}

let warnings: FallbackWarning[] = [];
let userDefinedDefaultSettings: GameSettings<Set<Joker>> | null = null;

/**
 * Loads the default settings of any new {@link GameInstance} from a given config file. Upon passing validation,
 * the settings are exposed globally via the {@link getDefaultGameSettings} function.
 */
export function loadDefaultGameSettings(configPath: string): GameSettings<Set<Joker>> {
  const settings = readGameSettings(configPath);

  userDefinedDefaultSettings = {
    ...settings,
    enabledJokers: new Set(settings.enabledJokers),
  };

  return userDefinedDefaultSettings;
}

/**
 * Returns the default settings that shall be applied to any new {@link GameInstance} based on hard-coded defaults,
 * optionally overridden by a user-defined settings config applied through {@link loadDefaultGameSettings}.
 */
export function getDefaultGameSettings(): GameSettings<Set<Joker>> {
  const baseSettings = userDefinedDefaultSettings ?? {
    ...DEFAULT_SETTINGS,
    enabledJokers: new Set(DEFAULT_SETTINGS.enabledJokers),
  };

  return structuredClone(baseSettings);
}

/**
 * Resolves the given path of property keys on an initial object. That is, this function follows nested properties
 * within `root` according to the property keys listed in `path` and returns the **value of the property** reached at the end
 * of this path.
 *
 * If resolving the path fails at any point, the function simply returns the `root` object/value.
 */
const resolveProperty = (root: unknown, path: readonly PropertyKey[] | undefined): unknown => {
  let current: unknown = root;

  if (path?.length) {
    for (const key of path) {
      if (typeof current !== 'object' || current === null) return root; // Failure: Current has no properties

      current = (current as Record<PropertyKey, unknown>)[key];
      if (current === undefined) return root; // Failure: Property [key] did not exist
    }
  }

  return current;
};

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

      warnings.push({
        propertyPath,
        errorMessage,
        inputValue: resolveProperty(issue.input, nestedPropertyPath),
        fallbackValue: resolveProperty(fallback, nestedPropertyPath),
      });
    }

    return fallback;
  };
};

const formatFallbackWarning = (warning: FallbackWarning, warningIndex: number): string => {
  const itemLabel: string = `  ${warningIndex + 1}.`;

  return (
    `${itemLabel} Property '${warning.propertyPath}' received invalid value ${stringify(warning.inputValue)} ` +
    `(${warning.errorMessage}).` +
    `\n${' '.repeat(itemLabel.length)} => Falling back to default: ${stringify(warning.fallbackValue, 2)}`
  );
};

const gameSettingsSchema = z.object({
  rounds: z.number().int().positive().catch(fallbackWithWarning('rounds', DEFAULT_SETTINGS.rounds)),
  maxGuessTime: z
    .number()
    .int()
    .positive()
    .catch(fallbackWithWarning('maxGuessTime', Math.round(DEFAULT_SETTINGS.maxGuessTime / 1000)))
    .transform(timeSeconds => timeSeconds * 1000),
  enabledJokers: z.array(z.enum(Joker)).catch(fallbackWithWarning('enabledJokers', DEFAULT_SETTINGS.enabledJokers)),
  firstBonusMultiplier: z
    .enum(FirstBonusMultiplier)
    .catch(fallbackWithWarning('firstBonusMultiplier', DEFAULT_SETTINGS.firstBonusMultiplier)),
  timeBonus: z
    .union([z.enum(TimeBonus), z.literal('off')])
    .nullable()
    .transform(val => (val === 'off' ? null : val))
    .catch(fallbackWithWarning('timeBonus', DEFAULT_SETTINGS.timeBonus)),
  streakBonusMultiplier: z
    .enum(StreakBonusMultiplier)
    .catch(fallbackWithWarning('streakBonusMultiplier', DEFAULT_SETTINGS.streakBonusMultiplier)),
  achievementBonuses: z
    .union([
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
          .max(Object.keys(AchievementBonusType).length - 1, {
            error: `'randomCount' must be smaller than the total number of available achievement bonus types (${Object.keys(AchievementBonusType).length})`,
          }),
      }),
      z.literal('off'),
    ])
    .nullable()
    .transform(val => (val === 'off' ? null : val))
    .catch(fallbackWithWarning('achievementBonuses', DEFAULT_SETTINGS.achievementBonuses)),
});

function readGameSettings(configPath: string): GameSettings<Joker[]> {
  if (!fs.existsSync(configPath)) {
    logger.info(
      `No settings config found at '${configPath}'. Initializing game with default settings.`,
      LogCategory.SETUP
    );
    return DEFAULT_SETTINGS;
  }

  try {
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const parsedConfig = JSON.parse(fileContent);

    warnings = [];
    const validatedSettings = gameSettingsSchema.parse(parsedConfig);

    logger.debug(`Loading game settings from '${configPath}'.`, LogCategory.SETUP);

    if (warnings.length > 0) {
      const pluralized = warnings.length === 1 ? 'property' : 'properties';
      const warningMessage =
        `Found ${warnings.length} invalid configuration ${pluralized} in '${configPath}':\n` +
        warnings.map(formatFallbackWarning).join('\n');
      logger.warn(warningMessage, LogCategory.SETUP, null);
    }

    return validatedSettings;
  } catch (error) {
    logger.error(
      `Failed to parse game settings from '${configPath}'. Falling back to default settings.`,
      LogCategory.SETUP,
      null,
      error instanceof Error ? error : String(error)
    );
  }

  return DEFAULT_SETTINGS;
}
