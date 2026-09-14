import { RadioGroup } from './RadioGroup';
import { themePreference, ThemePreference } from '../utils/switchTheme';
import { showKeyboardHints } from '../utils/showKeyboardHints';

export const LocalSettings = () => {
  return (
    <div className="local-settings">
      <div className="setting-item">
        <span>Colour Scheme</span>
        <RadioGroup<ThemePreference>
          groupId="theme-group"
          name="theme"
          options={[
            { label: 'Auto', value: 'auto' },
            { label: 'Dark', value: 'dark' },
            { label: 'Light', value: 'light' },
          ]}
          value={themePreference.value}
          onChange={val => (themePreference.value = val)}
        />
      </div>

      <div className="setting-item shortcut-badge-settings">
        <span>Keyboard Hints</span>
        <RadioGroup<boolean>
          groupId="keyboard-hints-group"
          name="keyboard-hints"
          options={[
            { label: 'Show', value: true },
            { label: 'Hide', value: false },
          ]}
          value={showKeyboardHints.value}
          onChange={val => (showKeyboardHints.value = val)}
        />
      </div>
    </div>
  );
};
