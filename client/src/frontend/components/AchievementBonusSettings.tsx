import { Signal, useSignal } from '@preact/signals';

import {
  AchievementBonuses,
  AchievementBonusMode,
  AchievementBonusType,
  capitalize,
  DEFAULT_ENABLED_ACHIEVEMENT_TYPES,
  DEFAULT_RANDOM_COUNT,
} from '@yasq/shared';
import { RadioGroup } from './RadioGroup';

type PanelMode = 'off' | AchievementBonusMode;

interface AchievementBonusSettingsPanelProps {
  settingsSignal: Signal<AchievementBonuses | null>;
}

/**
 * View-scoped local memory of what the user last configured, so checkbox selections and number settings survive
 * switches between the radio group panels.
 */
interface BonusStateCache {
  enabledTypes: AchievementBonusType[];
  randomCount: number;
}

const initializeCache = (settings: AchievementBonuses | null): BonusStateCache => ({
  enabledTypes:
    settings?.mode === AchievementBonusMode.MANUAL ? settings.enabledTypes : DEFAULT_ENABLED_ACHIEVEMENT_TYPES,
  randomCount: settings?.mode === AchievementBonusMode.RANDOM ? settings.randomCount : DEFAULT_RANDOM_COUNT,
});

export function AchievementBonusSettingsPanel({ settingsSignal }: AchievementBonusSettingsPanelProps) {
  const settings = settingsSignal.value; // AchievementBonuses | null
  const allBonusTypes = Object.values(AchievementBonusType);

  const cache = useSignal<BonusStateCache>(initializeCache(settingsSignal.value));
  const activePanel: PanelMode = !settings ? 'off' : settings.mode;

  // Update the real settings signal when the user switches panels
  const updateBonusState = (activePanel: PanelMode) => {
    const cachedState = cache.value;
    switch (activePanel) {
      case 'off':
        settingsSignal.value = null;
        break;
      case AchievementBonusMode.MANUAL:
        settingsSignal.value = {
          mode: AchievementBonusMode.MANUAL,
          enabledTypes: cachedState.enabledTypes,
        };
        break;
      case AchievementBonusMode.RANDOM:
        settingsSignal.value = {
          mode: AchievementBonusMode.RANDOM,
          randomCount: cachedState.randomCount,
        };
        break;
    }
  };

  const toggleBonusType = (bonusType: AchievementBonusType) => {
    const cacheState = cache.value;
    const updatedEnabledTypes = cacheState.enabledTypes.includes(bonusType)
      ? cacheState.enabledTypes.filter((t: AchievementBonusType) => t !== bonusType)
      : [...cacheState.enabledTypes, bonusType];

    cache.value = { ...cacheState, enabledTypes: updatedEnabledTypes };

    // Only propagate to the shared settings if manual is actually active.
    if (settingsSignal.value?.mode === AchievementBonusMode.MANUAL) {
      settingsSignal.value = { mode: AchievementBonusMode.MANUAL, enabledTypes: updatedEnabledTypes };
    }
  };

  const setRandomCount = (selectedCount: number) => {
    const cacheState = cache.value;

    const maxVal = allBonusTypes.length - 1;
    const clamped = Math.min(maxVal, Math.max(1, selectedCount));

    const updatedCount = isNaN(clamped) ? DEFAULT_RANDOM_COUNT : clamped;
    cache.value = { ...cacheState, randomCount: updatedCount };

    // Only propagate to the shared settings if random is actually active.
    if (settingsSignal.value?.mode === AchievementBonusMode.RANDOM) {
      settingsSignal.value = { mode: AchievementBonusMode.RANDOM, randomCount: updatedCount };
    }
  };

  return (
    <div className="achievement-settings">
      <RadioGroup
        groupId="achievement-mode-group"
        name="achievement-mode"
        value={activePanel}
        onChange={activePanel => updateBonusState(activePanel as PanelMode)}
        options={
          [
            { label: 'Off', value: 'off' },
            { label: 'Manual', value: AchievementBonusMode.MANUAL },
            { label: 'Random', value: AchievementBonusMode.RANDOM },
          ] satisfies { label: string; value: PanelMode }[]
        }
      />

      {settings?.mode === AchievementBonusMode.MANUAL && (
        <div className="achievement-checklist">
          {allBonusTypes.map(bonusType => {
            const isChecked = cache.value.enabledTypes.includes(bonusType);
            return (
              <label
                key={bonusType}
                className="checkbox-item"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleBonusType(bonusType)}
                />
                <span>{capitalize(bonusType)}</span>
              </label>
            );
          })}
        </div>
      )}

      {settings?.mode === AchievementBonusMode.RANDOM && (
        <div className="setting-item">
          <span>Number of random bonuses per game</span>
          <input
            type="number"
            min={1}
            max={allBonusTypes.length - 1}
            value={cache.value.randomCount}
            onInput={e => {
              const randomCount = Number((e.target as HTMLInputElement).value);
              setRandomCount(randomCount);
            }}
          />
        </div>
      )}
    </div>
  );
}
