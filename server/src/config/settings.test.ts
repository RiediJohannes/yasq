import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';

import {
  AchievementBonusMode,
  AchievementBonusType,
  DEFAULT_APP_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  FirstBonusMultiplier,
  Joker,
  StreakBonusMultiplier,
  TimeBonus,
} from '@yasq/shared';

import { LogCategory, logger } from '../utils/logger.js';
import { setServerRootDir } from '../utils/helper.js';
import { getAppSettings, getDefaultGameSettings, loadSettingsConfig } from './settings.js';

vi.mock('fs');

const serverDir: string = process.cwd();

beforeAll(() => {
  setServerRootDir(serverDir);
});

const mockGameSettings = (gameSettings: unknown, autoLoad = false) => {
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ gameSettings }));

  if (autoLoad) {
    loadSettingsConfig('config.json');
  }
};

const mockAppSettings = (appSettings: unknown, autoLoad = false) => {
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ appSettings }));

  if (autoLoad) {
    loadSettingsConfig('config.json');
  }
};

describe('settings', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDefaultGameSettings', () => {
    it('should return initial hard-coded defaults with enabledJokers as a Set', () => {
      const settings = getDefaultGameSettings();

      expect(settings.rounds).toBe(DEFAULT_GAME_SETTINGS.rounds);
      expect(settings.maxGuessTime).toBe(DEFAULT_GAME_SETTINGS.maxGuessTime);
      expect(settings.firstBonusMultiplier).toBe(DEFAULT_GAME_SETTINGS.firstBonusMultiplier);
      expect(settings.timeBonus).toBe(DEFAULT_GAME_SETTINGS.timeBonus);
      expect(settings.streakBonusMultiplier).toBe(DEFAULT_GAME_SETTINGS.streakBonusMultiplier);
      expect(settings.achievementBonuses).toEqual(DEFAULT_GAME_SETTINGS.achievementBonuses);
      expect(settings.enabledJokers).toBeInstanceOf(Set);
      expect(Array.from(settings.enabledJokers)).toEqual(DEFAULT_GAME_SETTINGS.enabledJokers);
    });

    it('should return a deep clone to prevent mutation of internal defaults', () => {
      const firstCall = getDefaultGameSettings();
      // Mutate the received settings object
      firstCall.rounds = 999;
      firstCall.enabledJokers.clear();
      if (firstCall.achievementBonuses && firstCall.achievementBonuses.mode === AchievementBonusMode.MANUAL) {
        firstCall.achievementBonuses.enabledTypes.pop();
      }

      const secondCall = getDefaultGameSettings();
      expect(secondCall.rounds).toBe(DEFAULT_GAME_SETTINGS.rounds);
      expect(secondCall.enabledJokers.size).toBe(DEFAULT_GAME_SETTINGS.enabledJokers.length);
      expect(secondCall.achievementBonuses).toEqual(DEFAULT_GAME_SETTINGS.achievementBonuses);
    });

    it('should return user-defined settings after loadDefaultGameSettings is called', () => {
      const customConfig = {
        rounds: 10,
        maxGuessTime: 45,
        enabledJokers: [Joker.TRIVIA],
        firstBonusMultiplier: FirstBonusMultiplier.LARGE,
        timeBonus: TimeBonus.EXPONENTIAL,
        streakBonusMultiplier: StreakBonusMultiplier.SMALL,
        achievementBonuses: {
          mode: AchievementBonusMode.RANDOM,
          randomCount: 2,
        },
      };

      mockGameSettings(customConfig, true);

      const settings = getDefaultGameSettings();
      expect(settings.rounds).toBe(10);
      expect(settings.maxGuessTime).toBe(45_000);
      expect(settings.enabledJokers).toEqual(new Set([Joker.TRIVIA]));
      expect(settings.firstBonusMultiplier).toBe(FirstBonusMultiplier.LARGE);
      expect(settings.timeBonus).toBe(TimeBonus.EXPONENTIAL);
      expect(settings.streakBonusMultiplier).toBe(StreakBonusMultiplier.SMALL);
      expect(settings.achievementBonuses).toEqual({
        mode: AchievementBonusMode.RANDOM,
        randomCount: 2,
      });
    });
  });

  describe('getAppSettings', () => {
    it('should return initial hard-coded default app settings', () => {
      const settings = getAppSettings();
      expect(settings).toEqual(DEFAULT_APP_SETTINGS);
    });

    it('should return a deep clone to prevent mutation of internal default app settings', () => {
      mockAppSettings(
        {
          sounds: {
            finalResultsLoop: 'initial_loop.mp3',
          },
        },
        true
      );

      const firstCall = getAppSettings();
      expect(firstCall.sounds.finalResultsLoop).toBe('initial_loop.mp3');
      firstCall.sounds.finalResultsLoop = 'mutated_loop.mp3';

      const secondCall = getAppSettings();
      expect(firstCall.sounds).not.toBe(secondCall.sounds);
      expect(firstCall.sounds.finalResultsLoop).toBe('mutated_loop.mp3');
      expect(secondCall.sounds.finalResultsLoop).toBe('initial_loop.mp3');
    });

    it('should return user-defined app settings after loadSettingsConfig is called', () => {
      mockAppSettings(
        {
          sounds: {
            finalResultsJingle: 'custom_jingle.mp3',
            finalResultsLoop: 'custom_loop.mp3',
          },
        },
        true
      );

      const settings = getAppSettings();
      expect(settings.sounds.finalResultsJingle).toBe('custom_jingle.mp3');
      expect(settings.sounds.finalResultsLoop).toBe('custom_loop.mp3');
    });

    it('should correctly handle nullish sound values in appSettings', () => {
      mockAppSettings(
        {
          sounds: {
            finalResultsJingle: null,
            finalResultsLoop: undefined,
          },
        },
        true
      );

      const settings = getAppSettings();
      expect(settings.sounds.finalResultsJingle).toBeNull();
      expect(settings.sounds.finalResultsLoop).toBeUndefined();
    });
  });

  describe('loadSettingsConfig', () => {
    describe('File parsing', () => {
      it('should fallback to default settings and log info when config file does not exist', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const result = loadSettingsConfig('non_existent.json');

        expect(result.rounds).toBe(DEFAULT_GAME_SETTINGS.rounds);
        expect(result.maxGuessTime).toBe(DEFAULT_GAME_SETTINGS.maxGuessTime);
        expect(result.enabledJokers).toEqual(new Set(DEFAULT_GAME_SETTINGS.enabledJokers));
        expect(infoSpy).toHaveBeenCalledWith(
          "No settings config found at 'non_existent.json'. Initializing app with default settings.",
          LogCategory.SETUP
        );
      });

      it('should fallback to default settings and log error when config file contains invalid JSON', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json format');

        const result = loadSettingsConfig('invalid.json');

        expect(result.rounds).toBe(DEFAULT_GAME_SETTINGS.rounds);
        expect(result.enabledJokers).toEqual(new Set(DEFAULT_GAME_SETTINGS.enabledJokers));
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to parse app settings from 'invalid.json'. Falling back to default settings.",
          LogCategory.SETUP,
          null,
          expect.any(Error)
        );
      });

      it('should load full valid settings configuration', () => {
        const customConfig = {
          rounds: 8,
          maxGuessTime: 45,
          enabledJokers: [Joker.OBFUSCATION, Joker.SPY],
          firstBonusMultiplier: FirstBonusMultiplier.SMALL,
          timeBonus: TimeBonus.LOGISTIC,
          streakBonusMultiplier: StreakBonusMultiplier.LARGE,
          achievementBonuses: {
            mode: AchievementBonusMode.RANDOM,
            randomCount: 3,
          },
        };

        mockGameSettings(customConfig);

        const result = loadSettingsConfig('custom.json');

        expect(result).toEqual({
          rounds: 8,
          maxGuessTime: 45_000, // guess time was converted from seconds to milliseconds
          enabledJokers: new Set([Joker.OBFUSCATION, Joker.SPY]),
          firstBonusMultiplier: FirstBonusMultiplier.SMALL,
          timeBonus: TimeBonus.LOGISTIC,
          streakBonusMultiplier: StreakBonusMultiplier.LARGE,
          achievementBonuses: {
            mode: AchievementBonusMode.RANDOM,
            randomCount: 3,
          },
        });
        expect(debugSpy).toHaveBeenCalledWith("Loading settings from 'custom.json'.", LogCategory.SETUP);
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it('should load partial configuration and fall back missing properties without warnings', () => {
        const partialConfig = {
          rounds: 12,
        };

        mockGameSettings(partialConfig);

        const result = loadSettingsConfig('partial.json');

        expect(result.rounds).toBe(12);
        expect(result.maxGuessTime).toBe(DEFAULT_GAME_SETTINGS.maxGuessTime);
        expect(result.enabledJokers).toEqual(new Set(DEFAULT_GAME_SETTINGS.enabledJokers));
        expect(result.firstBonusMultiplier).toBe(DEFAULT_GAME_SETTINGS.firstBonusMultiplier);
        expect(result.timeBonus).toBe(DEFAULT_GAME_SETTINGS.timeBonus);
        expect(result.streakBonusMultiplier).toBe(DEFAULT_GAME_SETTINGS.streakBonusMultiplier);
        expect(result.achievementBonuses).toEqual(DEFAULT_GAME_SETTINGS.achievementBonuses);
        expect(warnSpy).not.toHaveBeenCalled();
      });
    });

    describe('Schema validation and fallbacks', () => {
      describe('Game Settings', () => {
        it('should list invalid properties and their fallback values', () => {
          mockGameSettings(
            {
              rounds: 'invalid',
              maxGuessTime: -10,
            },
            true
          );

          const warningMsg = warnSpy.mock.calls[0]![0] as string;
          expect(warningMsg).toContain("Found 2 invalid configuration properties in 'config.json':");
          expect(warningMsg).toContain("1. Property 'rounds' received invalid value");
          expect(warningMsg).toContain('=> Falling back to default: 10');
          expect(warningMsg).toContain("2. Property 'maxGuessTime' received invalid value");
          expect(warningMsg).toContain('=> Falling back to default: 60');
        });

        it.each([
          ['negative number', -5],
          ['zero', 0],
          ['float', 3.5],
          ['string', 'invalid'],
          ['null', null],
        ])('should fallback rounds to default when value is %s', (_label, invalidValue) => {
          mockGameSettings({ rounds: invalidValue });

          const result = loadSettingsConfig('config.json');

          expect(result.rounds).toBe(DEFAULT_GAME_SETTINGS.rounds);
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("Property 'rounds' received invalid value"),
            LogCategory.SETUP,
            null
          );
        });

        it.each([
          ['negative number', -10],
          ['zero', 0],
          ['float', 12.3],
          ['string', 'fast'],
          ['null', null],
        ])('should fallback maxGuessTime to default when value is %s', (_label, invalidValue) => {
          mockGameSettings({ maxGuessTime: invalidValue });

          const result = loadSettingsConfig('config.json');

          expect(result.maxGuessTime).toBe(DEFAULT_GAME_SETTINGS.maxGuessTime);
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("Property 'maxGuessTime' received invalid value"),
            LogCategory.SETUP,
            null
          );
        });

        it.each([
          ['invalid joker string array', ['INVALID_JOKER']],
          ['partially invalid joker array', [Joker.TRIVIA, 'INVALID_JOKER']],
          ['non-array value', 'not_an_array'],
          ['null', null],
        ])('should fallback enabledJokers to default when value is %s', (_label, invalidValue) => {
          mockGameSettings({ enabledJokers: invalidValue });

          const result = loadSettingsConfig('config.json');

          expect(result.enabledJokers).toEqual(new Set(DEFAULT_GAME_SETTINGS.enabledJokers));
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("Property 'enabledJokers"),
            LogCategory.SETUP,
            null
          );
        });

        it.each([
          ['invalid number', 0.99],
          ['string', 'LARGE'],
          ['null', null],
        ])('should fallback firstBonusMultiplier to default when value is %s', (_label, invalidValue) => {
          mockGameSettings({ firstBonusMultiplier: invalidValue });

          const result = loadSettingsConfig('config.json');

          expect(result.firstBonusMultiplier).toBe(DEFAULT_GAME_SETTINGS.firstBonusMultiplier);
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("Property 'firstBonusMultiplier' received invalid value"),
            LogCategory.SETUP,
            null
          );
        });

        it('should accept null as valid timeBonus', () => {
          mockGameSettings({ timeBonus: null });

          const result = loadSettingsConfig('config.json');

          expect(result.timeBonus).toBeNull();
          expect(warnSpy).not.toHaveBeenCalled();
        });

        it('should accept "off" as valid timeBonus', () => {
          mockGameSettings({ timeBonus: 'off' });

          const result = loadSettingsConfig('config.json');

          expect(result.timeBonus).toBeNull();
          expect(warnSpy).not.toHaveBeenCalled();
        });

        it.each([
          ['invalid string', 'QUADRATIC'],
          ['number', 123],
        ])('should fallback timeBonus to default when value is %s', (_label, invalidValue) => {
          mockGameSettings({ timeBonus: invalidValue });

          const result = loadSettingsConfig('config.json');

          expect(result.timeBonus).toBe(DEFAULT_GAME_SETTINGS.timeBonus);
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("Property 'timeBonus' received invalid value"),
            LogCategory.SETUP,
            null
          );
        });

        it.each([
          ['invalid number', 0.8],
          ['string', 'MEDIUM'],
          ['null', null],
        ])('should fallback streakBonusMultiplier to default when value is %s', (_label, invalidValue) => {
          mockGameSettings({ streakBonusMultiplier: invalidValue });

          const result = loadSettingsConfig('config.json');

          expect(result.streakBonusMultiplier).toBe(DEFAULT_GAME_SETTINGS.streakBonusMultiplier);
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("Property 'streakBonusMultiplier' received invalid value"),
            LogCategory.SETUP,
            null
          );
        });

        describe('achievementBonuses', () => {
          it('should accept valid manual achievementBonuses configuration', () => {
            const validManual = {
              mode: AchievementBonusMode.MANUAL,
              enabledTypes: [AchievementBonusType.HIGHEST_STREAK],
            };

            mockGameSettings({ achievementBonuses: validManual });

            const result = loadSettingsConfig('config.json');

            expect(result.achievementBonuses).toEqual(validManual);
            expect(warnSpy).not.toHaveBeenCalled();
          });

          it('should accept valid random achievementBonuses configuration', () => {
            const validRandom = {
              mode: AchievementBonusMode.RANDOM,
              randomCount: 2,
            };

            mockGameSettings({ achievementBonuses: validRandom });

            const result = loadSettingsConfig('config.json');

            expect(result.achievementBonuses).toEqual(validRandom);
            expect(warnSpy).not.toHaveBeenCalled();
          });

          it('should accept null as valid achievementBonuses', () => {
            mockGameSettings({ achievementBonuses: null });

            const result = loadSettingsConfig('config.json');

            expect(result.achievementBonuses).toBeNull();
            expect(warnSpy).not.toHaveBeenCalled();
          });

          it('should accept "off" as valid achievementBonuses', () => {
            mockGameSettings({ achievementBonuses: 'off' });

            const result = loadSettingsConfig('config.json');

            expect(result.achievementBonuses).toBeNull();
            expect(warnSpy).not.toHaveBeenCalled();
          });

          it.each([
            ['invalid mode', { mode: 'invalid_mode' }],
            [
              'manual mode with non-array enabledTypes',
              { mode: AchievementBonusMode.MANUAL, enabledTypes: 'not-array' },
            ],
            [
              'manual mode with invalid type in array',
              { mode: AchievementBonusMode.MANUAL, enabledTypes: ['INVALID_TYPE'] },
            ],
            ['random mode with negative randomCount', { mode: AchievementBonusMode.RANDOM, randomCount: -1 }],
            ['random mode with zero randomCount', { mode: AchievementBonusMode.RANDOM, randomCount: 0 }],
            ['random mode with float randomCount', { mode: AchievementBonusMode.RANDOM, randomCount: 1.5 }],
            ['string value', 'invalid'],
            ['number value', 42],
          ])('should fallback achievementBonuses to default when value has %s', (_label, invalidValue) => {
            mockGameSettings({ achievementBonuses: invalidValue });

            const result = loadSettingsConfig('config.json');

            expect(result.achievementBonuses).toEqual(DEFAULT_GAME_SETTINGS.achievementBonuses);
            expect(warnSpy).toHaveBeenCalledWith(
              expect.stringContaining("Property 'achievementBonuses"),
              LogCategory.SETUP,
              null
            );
          });
        });
      });

      describe('App Settings', () => {
        it('should fallback sounds object to default when sounds property is invalid', () => {
          mockAppSettings(
            {
              sounds: 'not_an_object',
            },
            true
          );

          const settings = getAppSettings();
          expect(settings.sounds).toEqual(DEFAULT_APP_SETTINGS.sounds);
        });

        it.each([
          ['number', 123],
          ['boolean', true],
          ['array', ['sound.mp3']],
        ])('should fallback the entire sounds object when a sound property is invalid (%s)', (_label, invalidValue) => {
          mockAppSettings(
            {
              sounds: {
                finalResultsJingle: invalidValue,
              },
            },
            true
          );

          const settings = getAppSettings();
          expect(settings.sounds).toEqual(DEFAULT_APP_SETTINGS.sounds);
          expect(warnSpy).toHaveBeenCalled();
        });
      });
    });
  });
});
