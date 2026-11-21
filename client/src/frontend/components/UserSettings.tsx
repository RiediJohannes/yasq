import { ToggleSwitch } from '@components/ToggleSwitch';
import { InfoIcon } from '@components/Icons';
import { Placement, TooltipDiv } from '@components/Tooltip';

import { RadioGroup } from './RadioGroup';
import { themePreference, ThemePreference } from '../../utils/switchTheme';
import { alwaysShowScoreDetails, defaultReadyState, showKeyboardHints } from '../../utils/preferences';
import { setSignal } from '../../utils/helper';

export const UserSettings = () => {
  return (
    <div className="user-settings">
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
          onChange={setSignal(themePreference)}
        />
      </div>

      <hr className="divider" />

      <div className="setting-item keyboard-only">
        <span>Visual Help</span>
        <div className="toggle-setting">
          <ToggleSwitch
            id="keyboard-hints"
            label="Show keyboard hints"
            checked={showKeyboardHints.value}
            onChange={setSignal(showKeyboardHints)}
          />
        </div>
      </div>

      <div className="setting-item">
        <span>Game Flow</span>

        <div className="toggle-setting">
          <ToggleSwitch
            id="show-score-details"
            label="Always show score details"
            checked={alwaysShowScoreDetails.value}
            onChange={setSignal(alwaysShowScoreDetails)}
          />
          <TooltipDiv
            text="Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores"
            className="info"
            placement={Placement.ABOVE}
          >
            <InfoIcon />
          </TooltipDiv>
        </div>

        <div className="toggle-setting">
          <ToggleSwitch
            id="auto-ready"
            label={'Set me "ready" by default'}
            checked={defaultReadyState.value}
            onChange={setSignal(defaultReadyState)}
          />
          <TooltipDiv
            text="Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores"
            className="info"
            placement={Placement.ABOVE}
          >
            <InfoIcon />
          </TooltipDiv>
        </div>
      </div>
    </div>
  );
};
