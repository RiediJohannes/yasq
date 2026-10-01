import { AchievementBonusType, AchievementBonusMode, AchievementBonuses, capitalize } from '@yasq/shared';
import { RadioGroup } from './RadioGroup';
import { Signal } from '@preact/signals';

interface AchievementBonusSettingsPanelProps {
  settingsSignal: Signal<AchievementBonuses>;
}

export function AchievementBonusSettingsPanel({ settingsSignal }: AchievementBonusSettingsPanelProps) {
  const { mode, enabledTypes, randomCount } = settingsSignal.value;
  const allTypes = Object.values(AchievementBonusType);

  const update = (patch: Partial<AchievementBonuses>) => {
    settingsSignal.value = { ...settingsSignal.value, ...patch };
  };

  const toggleType = (type: AchievementBonusType) => {
    const next = enabledTypes.includes(type) ? enabledTypes.filter(t => t !== type) : [...enabledTypes, type];
    update({ enabledTypes: next });
  };

  return (
    <div className="achievement-settings">
      <RadioGroup
        groupId="achievement-mode-group"
        name="achievement-mode"
        value={mode}
        onChange={val => update({ mode: val as AchievementBonusMode })}
        options={[
          { label: 'Off', value: 'off' },
          { label: 'Manual', value: 'manual' },
          { label: 'Random', value: 'random' },
        ]}
      />

      {mode === 'manual' && (
        <div className="achievement-checklist">
          {allTypes.map(type => {
            const isChecked = enabledTypes.includes(type);
            return (
              <label
                key={type}
                className="checkbox-item"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleType(type)}
                />
                <span>{capitalize(type)}</span>
              </label>
            );
          })}
        </div>
      )}

      {mode === 'random' && (
        <div className="setting-item">
          <span>Number of random bonuses per game</span>
          <input
            type="number"
            min={1}
            max={allTypes.length - 1}
            value={randomCount}
            onInput={e => {
              const val = Number((e.target as HTMLInputElement).value);
              const maxVal = allTypes.length - 1;
              const clamped = Math.min(maxVal, Math.max(1, val));
              update({ randomCount: isNaN(clamped) ? 1 : clamped });
            }}
          />
        </div>
      )}
    </div>
  );
}
