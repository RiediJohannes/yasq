import { Signal, useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

import { AchievementBonusRule, AchievementBonuses, AchievementBonusMode, DEFAULT_RANDOM_COUNT } from '@yasq/shared';
import { RadioGroup } from './RadioGroup';

type PanelMode = 'off' | AchievementBonusMode;

interface AchievementBonusSettingsPanelProps {
  settingsSignal: Signal<AchievementBonuses | null>;
  rules: AchievementBonusRule[];
}

/**
 * View-scoped local memory of what the user last configured, so checkbox selections and number settings survive
 * switches between the radio group panels.
 */
interface BonusStateCache {
  enabledTypes: string[];
  randomCount: number;
}

const initializeCache = (settings: AchievementBonuses | null, rules: AchievementBonusRule[]): BonusStateCache => ({
  enabledTypes:
    settings?.mode === AchievementBonusMode.MANUAL
      ? settings.enabledTypes.filter(name => rules.length === 0 || rules.some(rule => rule.name === name))
      : rules.map(rule => rule.name),
  randomCount: settings?.mode === AchievementBonusMode.RANDOM ? settings.randomCount : DEFAULT_RANDOM_COUNT,
});

export function AchievementBonusSettingsPanel({ settingsSignal, rules }: AchievementBonusSettingsPanelProps) {
  const settings = settingsSignal.value; // AchievementBonuses | null
  const allBonusTypes = rules.map(rule => rule.name);

  const cache = useSignal<BonusStateCache>(initializeCache(settingsSignal.value, rules));
  const activePanel: PanelMode = !settings ? 'off' : settings.mode;
  const ruleKey = allBonusTypes.join('\u0000');

  useEffect(() => {
    if (allBonusTypes.length === 0) return;

    const cachedState = cache.value;
    const selectedTypes = cachedState.enabledTypes.filter(name => allBonusTypes.includes(name));
    if (selectedTypes.length === cachedState.enabledTypes.length) return;

    const currentTypes =
      settingsSignal.value?.mode === AchievementBonusMode.MANUAL
        ? settingsSignal.value.enabledTypes.filter(name => allBonusTypes.includes(name))
        : [];
    cache.value = {
      ...cachedState,
      enabledTypes: currentTypes.length ? currentTypes : selectedTypes.length ? selectedTypes : allBonusTypes,
    };
  }, [ruleKey]);

  const modeOptions = [
    { label: 'Off', value: 'off' as const },
    ...(allBonusTypes.length
      ? [
          { label: 'Manual', value: AchievementBonusMode.MANUAL },
          { label: 'Random', value: AchievementBonusMode.RANDOM },
        ]
      : []),
  ] satisfies { label: string; value: PanelMode }[];

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

  const toggleBonusType = (bonusType: string) => {
    const cacheState = cache.value;
    const updatedEnabledTypes = cacheState.enabledTypes.includes(bonusType)
      ? cacheState.enabledTypes.filter((t: string) => t !== bonusType)
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
        options={modeOptions}
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
                <span>{bonusType}</span>
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
