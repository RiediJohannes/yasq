import { useRef, useState } from 'preact/hooks';

import {
  AchievementBonusMode,
  AchievementBonusType,
  FirstBonusMultiplier,
  Joker,
  StreakBonusMultiplier,
  TimeBonus,
} from '@yasq/shared';

interface Settings {
  gameSettings: {
    rounds: number;
    maxGuessTime: number;
    enabledJokers: string[];
    firstBonusMultiplier: number;
    streakBonusMultiplier: number;
    timeBonus: string;
    achievementBonuses: {
      mode: string;
      enabledTypes?: string[];
      randomCount?: number;
    };
  };
  appSettings: {
    sounds: {
      finalResultsJingle: string;
      finalResultsLoop: string;
    };
  };
}

interface SettingsFormProps {
  initialSettings: Settings;
}

const FIRST_BONUS_OPTIONS = [
  { label: 'Off', value: FirstBonusMultiplier.OFF },
  { label: 'Small (10%)', value: FirstBonusMultiplier.SMALL },
  { label: 'Medium (20%)', value: FirstBonusMultiplier.MEDIUM },
  { label: 'Large (30%)', value: FirstBonusMultiplier.LARGE },
];

const STREAK_BONUS_OPTIONS = [
  { label: 'Off', value: StreakBonusMultiplier.OFF },
  { label: 'Small (5%)', value: StreakBonusMultiplier.SMALL },
  { label: 'Medium (10%)', value: StreakBonusMultiplier.MEDIUM },
  { label: 'Large (15%)', value: StreakBonusMultiplier.LARGE },
];

const ACHIEVEMENT_MODE_OPTIONS = [
  { label: 'Off', value: null },
  { label: 'Manual', value: AchievementBonusMode.MANUAL },
  { label: 'Random', value: AchievementBonusMode.RANDOM },
];

const TIME_BONUS_OPTIONS = [
  { label: 'Off', value: null },
  { label: 'Linear', value: TimeBonus.LINEAR },
  { label: 'Exponential', value: TimeBonus.EXPONENTIAL },
  { label: 'Logistic', value: TimeBonus.LOGISTIC },
];

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [finalResultsJingleFile, setFinalResultsJingleFile] = useState<File | null>(null);
  const [finalResultsLoopFile, setFinalResultsLoopFile] = useState<File | null>(null);
  const finalResultsJingleFileRef = useRef<HTMLInputElement>(null);
  const finalResultsLoopFileRef = useRef<HTMLInputElement>(null);

  const handleGameChange = (field: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      gameSettings: { ...prev.gameSettings, [field]: value },
    }));
  };

  const handleToggleJoker = (joker: string) => {
    const current = settings.gameSettings.enabledJokers;
    const updated = current.includes(joker) ? current.filter(j => j !== joker) : [...current, joker];
    handleGameChange('enabledJokers', updated);
  };

  const achievementBonuses = settings.gameSettings.achievementBonuses;
  const currentMode = !achievementBonuses ? null : achievementBonuses.mode;

  const handleAchievementModeChange = (newMode: string | null) => {
    if (newMode === null) {
      handleGameChange('achievementBonuses', newMode);
    } else if (newMode === AchievementBonusMode.MANUAL) {
      handleGameChange('achievementBonuses', {
        mode: AchievementBonusMode.MANUAL,
        enabledTypes: achievementBonuses?.mode === AchievementBonusMode.MANUAL ? achievementBonuses.enabledTypes : [],
      });
    } else if (newMode === AchievementBonusMode.RANDOM) {
      handleGameChange('achievementBonuses', {
        mode: AchievementBonusMode.RANDOM,
        randomCount: achievementBonuses?.mode === AchievementBonusMode.RANDOM ? achievementBonuses.randomCount : 2,
      });
    }
  };

  const handleToggleAchievementType = (type: AchievementBonusType) => {
    if (!achievementBonuses || achievementBonuses.mode !== AchievementBonusMode.MANUAL) return;

    const currentTypes = (achievementBonuses.enabledTypes || []) as AchievementBonusType[];

    const updatedTypes = currentTypes.includes(type) ? currentTypes.filter(t => t !== type) : [...currentTypes, type];

    handleGameChange('achievementBonuses', {
      ...achievementBonuses,
      enabledTypes: updatedTypes,
    });
  };

  const handleSoundChange = (field: string, value: string | null | undefined) => {
    setSettings(prev => ({
      ...prev,
      appSettings: {
        ...prev.appSettings,
        sounds: { ...prev.appSettings.sounds, [field]: value },
      },
    }));
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    if (finalResultsJingleFile) {
      const uploadRes = await fetch('/api/upload?type=sound', {
        method: 'POST',
        headers: { 'X-File-Name': encodeURIComponent(finalResultsJingleFile.name) },
        body: finalResultsJingleFile,
      });
      if (uploadRes.ok) {
        const data = await uploadRes.json();
        settings.appSettings.sounds.finalResultsJingle = data.filename;
      }
    }

    if (finalResultsLoopFile) {
      const uploadRes = await fetch('/api/upload?type=sound', {
        method: 'POST',
        headers: { 'X-File-Name': encodeURIComponent(finalResultsLoopFile.name) },
        body: finalResultsLoopFile,
      });
      if (uploadRes.ok) {
        const data = await uploadRes.json();
        settings.appSettings.sounds.finalResultsLoop = data.filename;
      }
    }

    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      setSettings(await res.json());
      alert('Settings saved successfully!');
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to delete the settings file and reset to defaults?')) return;

    try {
      const res = await fetch('/api/settings', { method: 'DELETE' });
      if (res.ok) {
        const defaultSettings = await res.json();
        setSettings(defaultSettings);
        alert('Settings reset to defaults!');
      } else {
        alert('Failed to reset settings.');
      }
    } catch (err) {
      console.error('Error resetting settings:', err);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="card creator-form"
    >
      <h3>Game Settings</h3>

      <div className="field">
        <label htmlFor="rounds">Rounds</label>
        <input
          id="rounds"
          type="number"
          value={settings.gameSettings.rounds}
          onInput={e => handleGameChange('rounds', Number((e.target as HTMLInputElement).value))}
        />
      </div>

      <div className="field">
        <label htmlFor="maxGuessTime">Max Guess Time (seconds)</label>
        <input
          id="maxGuessTime"
          type="number"
          step="1"
          value={settings.gameSettings.maxGuessTime / 1000}
          onInput={e => handleGameChange('maxGuessTime', Number((e.target as HTMLInputElement).value) * 1000)}
        />
      </div>

      <div className="field">
        <label>Enabled Jokers</label>
        <div className="tag-checkboxes-list">
          {Object.values(Joker).map(joker => (
            <label
              key={joker}
              className="tag-checkbox-label"
            >
              <div className="tag-checkbox-content">
                <input
                  type="checkbox"
                  checked={settings.gameSettings.enabledJokers.includes(joker)}
                  onChange={() => handleToggleJoker(joker)}
                />
                <span>{joker}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label>First Bonus Multiplier</label>
        <div className="radio-group-pills">
          {FIRST_BONUS_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={`radio-pill ${settings.gameSettings.firstBonusMultiplier === opt.value ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="firstBonusMultiplier"
                value={opt.value}
                checked={settings.gameSettings.firstBonusMultiplier === opt.value}
                onChange={() => handleGameChange('firstBonusMultiplier', opt.value)}
                style={{ display: 'none' }}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="streakBonusMultiplier">Streak Bonus Multiplier</label>
        <div className="radio-group-pills">
          {STREAK_BONUS_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={`radio-pill ${settings.gameSettings.streakBonusMultiplier === opt.value ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="streakBonusMultiplier"
                value={opt.value}
                checked={settings.gameSettings.streakBonusMultiplier === opt.value}
                onChange={() => handleGameChange('streakBonusMultiplier', opt.value)}
                style={{ display: 'none' }}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="timeBonus">Time Bonus</label>
        <div className="radio-group-pills">
          {TIME_BONUS_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={`radio-pill ${settings.gameSettings.timeBonus === opt.value ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="timeBonus"
                checked={settings.gameSettings.timeBonus === opt.value}
                onChange={() => handleGameChange('timeBonus', opt.value)}
                style={{ display: 'none' }}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <h4>Achievement Bonuses</h4>
      <div className="field">
        <label>Mode</label>
        <div
          className="radio-group-pills"
          style={{ gridTemplateColumns: `repeat(${ACHIEVEMENT_MODE_OPTIONS.length}, 1fr)` }}
        >
          {ACHIEVEMENT_MODE_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={`radio-pill ${currentMode === opt.value ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="achievementMode"
                checked={currentMode === opt.value}
                onChange={() => handleAchievementModeChange(opt.value)}
                style={{ display: 'none' }}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {currentMode === AchievementBonusMode.MANUAL && (
        <div className="field">
          <label>Enabled Achievement Types</label>
          <div className="tag-checkboxes-list">
            {Object.values(AchievementBonusType).map(type => (
              <label
                key={type}
                className="tag-checkbox-label"
              >
                <div className="tag-checkbox-content">
                  <input
                    type="checkbox"
                    checked={achievementBonuses.enabledTypes?.includes(type)}
                    onChange={() => handleToggleAchievementType(type)}
                  />
                  <span>{type}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {currentMode === AchievementBonusMode.RANDOM && (
        <div className="field">
          <label htmlFor="randomCount">Random Count</label>
          <input
            id="randomCount"
            type="number"
            min="1"
            max={Object.values(AchievementBonusType).length - 1}
            value={achievementBonuses.randomCount}
            onInput={e => {
              const val = Number((e.target as HTMLInputElement).value);
              const maxAllowed = Object.values(AchievementBonusType).length - 1;
              const clamped = Math.min(Math.max(1, val), maxAllowed);
              handleGameChange('achievementBonuses', {
                ...achievementBonuses,
                randomCount: clamped,
              });
            }}
          />
        </div>
      )}

      <h3>App Settings</h3>

      <div className="field">
        <label htmlFor="final-results-jingle-file-input">Final Results Jingle File</label>
        <div className="file-input-wrapper">
          <input
            ref={finalResultsJingleFileRef}
            id="final-results-jingle-file-input"
            type="file"
            accept="audio/*"
            onChange={e => {
              const files = (e.target as HTMLInputElement).files;
              if (files && files[0]) {
                setFinalResultsJingleFile(files[0]);
                handleSoundChange('finalResultsJingle', files[0].name);
              }
            }}
          />

          {settings.appSettings.sounds.finalResultsJingle !== null && (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                handleSoundChange('finalResultsJingle', null);
                setFinalResultsJingleFile(null);
                if (finalResultsJingleFileRef.current) {
                  finalResultsJingleFileRef.current.value = '';
                }
              }}
            >
              Turn Off
            </button>
          )}

          {settings.appSettings.sounds.finalResultsJingle !== undefined && (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                handleSoundChange('finalResultsJingle', undefined);
                setFinalResultsJingleFile(null);
                if (finalResultsJingleFileRef.current) {
                  finalResultsJingleFileRef.current.value = '';
                }
              }}
            >
              Reset to Default
            </button>
          )}
        </div>
        {settings.appSettings.sounds.finalResultsJingle !== undefined &&
          (settings.appSettings.sounds.finalResultsJingle === null ? (
            <small>Final Results Jingle is turned off.</small>
          ) : (
            <small>Current audio file: {settings.appSettings.sounds.finalResultsJingle}</small>
          ))}
      </div>

      <div className="field">
        <label htmlFor="final-results-loop-file-input">Final Results Loop File</label>
        <div className="file-input-wrapper">
          <input
            ref={finalResultsLoopFileRef}
            id="final-results-loop-file-input"
            type="file"
            accept="audio/*"
            onChange={e => {
              const files = (e.target as HTMLInputElement).files;
              if (files && files[0]) {
                setFinalResultsLoopFile(files[0]);
                handleSoundChange('finalResultsLoop', files[0].name);
              }
            }}
          />

          {settings.appSettings.sounds.finalResultsLoop !== null && (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                handleSoundChange('finalResultsLoop', null);
                setFinalResultsLoopFile(null);
                if (finalResultsLoopFileRef.current) {
                  finalResultsLoopFileRef.current.value = '';
                }
              }}
            >
              Turn Off
            </button>
          )}

          {settings.appSettings.sounds.finalResultsLoop !== undefined && (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                handleSoundChange('finalResultsLoop', undefined);
                setFinalResultsLoopFile(null);
                if (finalResultsLoopFileRef.current) {
                  finalResultsLoopFileRef.current.value = '';
                }
              }}
            >
              Reset to Default
            </button>
          )}
        </div>
        {settings.appSettings.sounds.finalResultsLoop !== undefined &&
          (settings.appSettings.sounds.finalResultsLoop === null ? (
            <small>Final Results Loop is turned off.</small>
          ) : (
            <small>Current audio file: {settings.appSettings.sounds.finalResultsLoop}</small>
          ))}
      </div>

      <div className="form-actions">
        <button
          type="submit"
          className="primary-btn"
        >
          Save Settings
        </button>
        <button
          type="button"
          className="danger-btn"
          onClick={handleReset}
        >
          Reset to Defaults
        </button>
      </div>
    </form>
  );
}
