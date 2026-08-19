import * as backend from '../utils/backend';
import { auth, discordSdk, gameState, participants } from '../main';
import { capitalize, formatBonusMultiplier } from '../utils/helper';
import { ALL_JOKER_ICONS, InfoIcon } from '../components/Icons';
import { OptionalTimeBonus, TOptionalTimeBonus } from '../utils/types';
import { Joker, TimeBonus } from '@yasq/shared';
import { ReadyButton } from '../components/ReadyButton';
import { TooltipDiv, WithTooltip } from '../components/Tooltip';
import { useSignal } from '@preact/signals';
import { TimeBonusPlot } from '../components/TimeBonusPlot';
import { useTimeBonusSamples } from '../hooks/useTimeBonusSamples';
import { Modal } from '../components/Modal';

export const PLAYER_TIME_BONUS_LABELS: Record<TOptionalTimeBonus, string> = {
  [TimeBonus.LINEAR]: '⏳ Steady Pace',
  [TimeBonus.EXPONENTIAL]: '🔥 Quick Fire',
  [TimeBonus.LOGISTIC]: '⚖️ Balanced',
  NONE: '❌ No time bonus',
};

export const LobbyView = ({ isHost }: { isHost: boolean }) => {
  const playersExcludingHost = participants.value.filter(p => p.id !== gameState.value.hostId);
  const readyUsers = playersExcludingHost.filter(p => gameState.value.readyUsers.includes(p.id)).length;
  const allPlayersAreReady = playersExcludingHost.length > 0 && readyUsers === playersExcludingHost.length;

  const handleStart = async () => {
    await backend.startGame(auth.value.access_token, discordSdk.instanceId);
  };

  const handleEditSettings = async () => {
    await backend.restartGame(auth.value.access_token, discordSdk.instanceId);
  };

  const currentTimeBonusName = gameState.value.gameSettings.timeBonus?.replace('_', '') ?? 'None';
  const currentTimeBonusLabel =
    PLAYER_TIME_BONUS_LABELS[(gameState.value.gameSettings.timeBonus as TOptionalTimeBonus) ?? OptionalTimeBonus.NONE];

  const { timeBonusSamples, isLoading } = useTimeBonusSamples();
  const activeTimeBonusSample =
    gameState.value.gameSettings.timeBonus !== null
      ? timeBonusSamples.value.get(gameState.value.gameSettings.timeBonus)
      : null;

  const sampleParticipants = new Map((activeTimeBonusSample?.participants || []).map(p => [p.id, p]));

  const showTimeBonusDialog = useSignal<boolean>(false);
  const openTimeBonusDialog = () => {
    showTimeBonusDialog.value = true;
  };
  const closeTimeBonusDialog = () => {
    showTimeBonusDialog.value = false;
  };

  return (
    <div
      id="lobby"
      className="centered"
    >
      <div
        id="settings-summary"
        className="card-container"
      >
        <h2>Game Settings</h2>
        <hr className="divider" />

        <dl className="settings-grid">
          <dt>🔄 Rounds</dt>
          <dd id="settings-rounds">{gameState.value.gameSettings.rounds}</dd>

          <dt>⏳ Guess Time</dt>
          <dd id="settings-guess-time">{(gameState.value.gameSettings.maxGuessTime ?? 0) / 1000}s</dd>

          <dt className="top">❓ Jokers</dt>
          <dd id="settings-jokers">
            <div className="joker-column">
              {gameState.value.gameSettings.enabledJokers.length ? (
                gameState.value.gameSettings.enabledJokers.map((jokerType: Joker) => {
                  const JokerIcon = ALL_JOKER_ICONS.find(Icon => Icon.jokerType === jokerType);

                  return (
                    <div
                      key={jokerType}
                      className="joker-row-item"
                      data-joker-type={jokerType}
                    >
                      {JokerIcon && (
                        <TooltipDiv
                          text={JokerIcon?.description || 'Description not available'}
                          className={`joker-indicator`}
                          role="img"
                        >
                          <JokerIcon />
                        </TooltipDiv>
                      )}
                      <span className="joker-text-name">{capitalize(jokerType)}</span>
                    </div>
                  );
                })
              ) : (
                <span className="no-jokers">None</span>
              )}
            </div>
          </dd>

          <dt>⏱️ Time Bonus</dt>
          <dd id="settings-time-bonus">
            <div className="time-bonus-row">
              <span>{currentTimeBonusLabel}</span>
              {activeTimeBonusSample && (
                <WithTooltip text="Click for more info">
                  <button
                    className="time-bonus-info-btn"
                    onClick={openTimeBonusDialog}
                  >
                    <InfoIcon />
                  </button>
                </WithTooltip>
              )}
            </div>

            <Modal
              title={`Time Bonus Calculation - ${capitalize(currentTimeBonusName)} Decay`}
              width="650px"
              height="380px"
              isOpen={showTimeBonusDialog.value}
              onClose={closeTimeBonusDialog}
            >
              <p>
                The time bonus you earn always depends on your <span className="highlight">answer speed</span> in
                relation to the total guess time and the speed of the other players. The latter matters because the time
                bonus <span className="highlight">only starts diminishing</span> once the{' '}
                <span className="highlight">first (at least partially) correct answer</span> arrives.
              </p>
              <p>
                The following graph shows the value of the time bonus over time for some sample answer times of
                simulated players.
              </p>
              <p className="text-row">
                <span>Showing calculation for:</span>
                <span className="time-bonus-label guess-text">{currentTimeBonusLabel}</span>
                <code>({currentTimeBonusName.toLowerCase()} decay)</code>
              </p>
              {isLoading.value ? (
                <p className="info-message time-bonus-loading">Loading sample data...</p>
              ) : (
                <TimeBonusPlot
                  currentPlayer={null}
                  participants={sampleParticipants}
                  data={activeTimeBonusSample?.timeBonusSummary ?? null}
                />
              )}
            </Modal>
          </dd>

          <dt>🥇 First Bonus</dt>
          <dd id="settings-first-bonus">{formatBonusMultiplier(gameState.value.gameSettings.firstBonusMultiplier)}</dd>

          <dt>🔥 Streak Bonus</dt>
          <dd id="settings-streak-bonus">
            {formatBonusMultiplier(gameState.value.gameSettings.streakBonusMultiplier)}
          </dd>
        </dl>

        {isHost && (
          <button
            onClick={handleEditSettings}
            title="Edit Game Settings"
          >
            ⚙️ Edit
          </button>
        )}
      </div>

      <div className="lobby-footer">
        {isHost ? (
          <button
            id="btn-start"
            disabled={!allPlayersAreReady}
            onClick={handleStart}
          >
            {allPlayersAreReady ? 'Start Game' : `Waiting... (${readyUsers}/${playersExcludingHost.length})`}
          </button>
        ) : (
          <ReadyButton promptText={'Ready Up'} />
        )}
      </div>
    </div>
  );
};
