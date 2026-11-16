import { useRef, useState } from 'preact/hooks';

import {
  AchievementBonusAggregate,
  AchievementBonusFilter,
  AchievementBonusGoal,
  AchievementBonusMetric,
  AchievementBonusMode,
  type AchievementBonusRule,
  capitalize,
  DEFAULT_ACHIEVEMENT_BONUS_RULES,
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
    } | null;
  };
  appSettings: {
    sounds: {
      finalResultsJingle: string;
      finalResultsLoop: string;
    };
    achievementBonuses?: AchievementBonusRule[];
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
  const [achievementRuleDraft, setAchievementRuleDraft] = useState({
    name: '',
    description: '',
    metric: AchievementBonusMetric.GUESS_TIME,
    filter: AchievementBonusFilter.ANY,
    aggregate: AchievementBonusAggregate.AVERAGE,
    goal: AchievementBonusGoal.HIGHEST,
    reward: 100,
  });
  const [achievementRuleError, setAchievementRuleError] = useState('');
  const [isAchievementRuleFormOpen, setIsAchievementRuleFormOpen] = useState(false);

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

  const handleToggleAchievementType = (type: string) => {
    if (!achievementBonuses || achievementBonuses.mode !== AchievementBonusMode.MANUAL) return;

    const currentTypes = achievementBonuses.enabledTypes || [];

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

  const configuredRules = settings.appSettings.achievementBonuses ?? DEFAULT_ACHIEVEMENT_BONUS_RULES;
  const availableRules = configuredRules;
  const achievementModeOptions = availableRules.length
    ? ACHIEVEMENT_MODE_OPTIONS
    : ACHIEVEMENT_MODE_OPTIONS.slice(0, 1);

  const updateAchievementRules = (rules: AchievementBonusRule[]) => {
    setSettings(prev => {
      const previousTypes =
        prev.appSettings.achievementBonuses !== undefined
          ? prev.appSettings.achievementBonuses.map(rule => rule.name)
          : DEFAULT_ACHIEVEMENT_BONUS_RULES.map(rule => rule.name);
      const nextTypes = rules.map(rule => rule.name);
      const currentBonuses = prev.gameSettings.achievementBonuses;

      let updatedBonuses = nextTypes.length === 0 ? null : currentBonuses;
      if (nextTypes.length > 0 && currentBonuses?.mode === AchievementBonusMode.MANUAL) {
        const selectedTypes = currentBonuses.enabledTypes ?? [];
        updatedBonuses = {
          ...currentBonuses,
          enabledTypes: [
            ...selectedTypes.filter(id => nextTypes.includes(id)),
            ...nextTypes.filter(id => !previousTypes.includes(id)),
          ],
        };
      } else if (nextTypes.length > 0 && currentBonuses?.mode === AchievementBonusMode.RANDOM) {
        updatedBonuses = {
          ...currentBonuses,
          randomCount: Math.min(currentBonuses.randomCount ?? 1, nextTypes.length),
        };
      }

      return {
        ...prev,
        gameSettings: { ...prev.gameSettings, achievementBonuses: updatedBonuses },
        appSettings: {
          ...prev.appSettings,
          achievementBonuses: rules,
        },
      };
    });
  };

  const restoreDefaultAchievementRules = () => {
    const defaultNames = new Set(DEFAULT_ACHIEVEMENT_BONUS_RULES.map(rule => rule.name.toLowerCase()));
    const currentRulesByName = new Map(configuredRules.map(rule => [rule.name.toLowerCase(), rule]));
    const restoredDefaults = DEFAULT_ACHIEVEMENT_BONUS_RULES.map(
      rule => currentRulesByName.get(rule.name.toLowerCase()) ?? rule
    );
    const customRules = configuredRules.filter(rule => !defaultNames.has(rule.name.toLowerCase()));

    updateAchievementRules([...restoredDefaults, ...customRules]);
  };

  const hasMissingDefaultRules = DEFAULT_ACHIEVEMENT_BONUS_RULES.some(
    rule => !configuredRules.some(existing => existing.name.toLowerCase() === rule.name.toLowerCase())
  );

  const addAchievementRule = () => {
    const name = achievementRuleDraft.name.trim();

    if (!name) {
      setAchievementRuleError('Enter a name.');
      return;
    }
    if (configuredRules.some(rule => rule.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setAchievementRuleError('Achievement names must be unique.');
      return;
    }
    if (achievementRuleDraft.reward < 0 || !Number.isFinite(achievementRuleDraft.reward)) {
      setAchievementRuleError('Reward must be a non-negative number.');
      return;
    }

    const rule: AchievementBonusRule = {
      name,
      metric: achievementRuleDraft.metric,
      goal: achievementRuleDraft.goal,
      reward: achievementRuleDraft.reward,
      ...(achievementRuleDraft.metric === AchievementBonusMetric.STREAK
        ? {}
        : {
            filter: achievementRuleDraft.filter,
            aggregate: achievementRuleDraft.aggregate,
          }),
      ...(achievementRuleDraft.description.trim() ? { description: achievementRuleDraft.description.trim() } : {}),
    };

    updateAchievementRules([...configuredRules, rule]);
    setAchievementRuleDraft({
      name: '',
      description: '',
      metric: AchievementBonusMetric.GUESS_TIME,
      filter: AchievementBonusFilter.ANY,
      aggregate: AchievementBonusAggregate.AVERAGE,
      goal: AchievementBonusGoal.HIGHEST,
      reward: 100,
    });
    setAchievementRuleError('');
    setIsAchievementRuleFormOpen(false);
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
      className="card creator-form settings-form"
    >
      <div className="settings-section">
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
            value={settings.gameSettings.maxGuessTime}
            onInput={e => handleGameChange('maxGuessTime', Number((e.target as HTMLInputElement).value))}
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
            style={{ gridTemplateColumns: `repeat(${achievementModeOptions.length}, 1fr)` }}
          >
            {achievementModeOptions.map(opt => (
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

        {achievementBonuses?.mode === AchievementBonusMode.MANUAL && (
          <div className="field">
            <label>Enabled Achievement Types</label>
            <div className="tag-checkboxes-list">
              {availableRules.map(rule => (
                <label
                  key={rule.name}
                  className="tag-checkbox-label"
                >
                  <div className="tag-checkbox-content">
                    <input
                      type="checkbox"
                      checked={achievementBonuses.enabledTypes?.includes(rule.name)}
                      onChange={() => handleToggleAchievementType(rule.name)}
                    />
                    <span>{rule.name === rule.name.toUpperCase() ? capitalize(rule.name) : rule.name}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {achievementBonuses?.mode === AchievementBonusMode.RANDOM && (
          <div className="field">
            <label htmlFor="randomCount">Random Count</label>
            <input
              id="randomCount"
              type="number"
              min="1"
              max={availableRules.length - 1}
              value={achievementBonuses.randomCount}
              onInput={e => {
                const val = Number((e.target as HTMLInputElement).value);
                const maxAllowed = availableRules.length - 1;
                const clamped = Math.min(Math.max(1, val), maxAllowed);
                handleGameChange('achievementBonuses', {
                  ...achievementBonuses,
                  randomCount: clamped,
                });
              }}
            />
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>App Settings</h3>

        <div className="tag-filter-header">
          <label>Achievement Bonuses</label>
          {hasMissingDefaultRules && (
            <button
              type="button"
              className="secondary-btn"
              onClick={restoreDefaultAchievementRules}
            >
              Restore Default Bonuses
            </button>
          )}
        </div>
        <ul
          className="achievement-bonus-list"
          aria-label="Achievement bonuses"
        >
          {configuredRules.map(rule => (
            <li key={rule.name}>
              {rule.name}
              <button
                type="button"
                className="secondary-btn"
                aria-label={`Remove ${rule.name}`}
                onClick={() => updateAchievementRules(configuredRules.filter(existing => existing.name !== rule.name))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="secondary-btn"
          aria-expanded={isAchievementRuleFormOpen}
          aria-controls="achievement-bonus-form"
          onClick={() => setIsAchievementRuleFormOpen(isOpen => !isOpen)}
        >
          {isAchievementRuleFormOpen ? 'Cancel' : 'Add custom achievement bonus'}
        </button>
        <div
          id="achievement-bonus-form"
          className="achievement-bonus-form"
          hidden={!isAchievementRuleFormOpen}
        >
          <div className="field">
            <label htmlFor="achievement-rule-name">Name</label>
            <input
              id="achievement-rule-name"
              type="text"
              maxLength={64}
              value={achievementRuleDraft.name}
              onInput={e => setAchievementRuleDraft(prev => ({ ...prev, name: (e.target as HTMLInputElement).value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="achievement-rule-description">Description (optional)</label>
            <input
              id="achievement-rule-description"
              type="text"
              value={achievementRuleDraft.description}
              onInput={e =>
                setAchievementRuleDraft(prev => ({ ...prev, description: (e.target as HTMLInputElement).value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="achievement-rule-metric">Metric</label>
            <select
              id="achievement-rule-metric"
              value={achievementRuleDraft.metric}
              onChange={e =>
                setAchievementRuleDraft(prev => ({
                  ...prev,
                  metric: (e.target as HTMLSelectElement).value as AchievementBonusMetric,
                }))
              }
            >
              {Object.values(AchievementBonusMetric).map(metric => (
                <option
                  key={metric}
                  value={metric}
                >
                  {metric}
                </option>
              ))}
            </select>
          </div>
          {achievementRuleDraft.metric !== AchievementBonusMetric.STREAK && (
            <>
              <div className="field">
                <label htmlFor="achievement-rule-filter">Filter</label>
                <select
                  id="achievement-rule-filter"
                  value={achievementRuleDraft.filter}
                  onChange={e =>
                    setAchievementRuleDraft(prev => ({
                      ...prev,
                      filter: (e.target as HTMLSelectElement).value as AchievementBonusFilter,
                    }))
                  }
                >
                  {Object.values(AchievementBonusFilter).map(filter => (
                    <option
                      key={filter}
                      value={filter}
                    >
                      {filter}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="achievement-rule-aggregate">Aggregate</label>
                <select
                  id="achievement-rule-aggregate"
                  value={achievementRuleDraft.aggregate}
                  onChange={e =>
                    setAchievementRuleDraft(prev => ({
                      ...prev,
                      aggregate: (e.target as HTMLSelectElement).value as AchievementBonusAggregate,
                    }))
                  }
                >
                  {Object.values(AchievementBonusAggregate).map(aggregate => (
                    <option
                      key={aggregate}
                      value={aggregate}
                    >
                      {aggregate}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="achievement-rule-goal">Goal</label>
            <select
              id="achievement-rule-goal"
              value={achievementRuleDraft.goal}
              onChange={e =>
                setAchievementRuleDraft(prev => ({
                  ...prev,
                  goal: (e.target as HTMLSelectElement).value as AchievementBonusGoal,
                }))
              }
            >
              {Object.values(AchievementBonusGoal).map(goal => (
                <option
                  key={goal}
                  value={goal}
                >
                  {goal}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="achievement-rule-reward">Reward</label>
            <input
              id="achievement-rule-reward"
              type="number"
              min="0"
              step="1"
              value={achievementRuleDraft.reward}
              onInput={e =>
                setAchievementRuleDraft(prev => ({ ...prev, reward: Number((e.target as HTMLInputElement).value) }))
              }
            />
          </div>
          {achievementRuleError && <p role="alert">{achievementRuleError}</p>}
          <button
            type="button"
            className="secondary-btn"
            onClick={addAchievementRule}
          >
            Add Achievement Bonus
          </button>
        </div>

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
