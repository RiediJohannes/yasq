import { useSignal } from '@preact/signals';

import { RadioGroup } from './RadioGroup';
import { NonDraggableImg } from './NonDraggableImg';
import { ALL_JOKER_ICONS } from './Icons';
import { capitalize } from '../utils/helper';

export const HowToPlay = ({ isHost }: { isHost: boolean }) => {
  const activeTab = useSignal<'player' | 'host'>(isHost ? 'host' : 'player');

  return (
    <div>
      <RadioGroup<string>
        groupId="how-to-play-tabs"
        name="how-to-play-view"
        options={[
          { label: 'For Players', value: 'player' },
          { label: 'For Hosts', value: 'host' },
        ]}
        value={activeTab.value}
        onChange={val => (activeTab.value = val as 'player' | 'host')}
      />

      {activeTab.value === 'player' && (
        <div className="instructions-tab-content">
          <div className="instruction-step">
            <NonDraggableImg
              src="/how-to-play-player-1.png"
              alt="Guessing interface preview"
            />
            <div>
              <h3>🎵 Guess the Game</h3>
              <p>Listen to the audio track and guess the correct game as quickly as possible!</p>
              <p>
                You can either submit your guess by clicking the <strong>Submit Guess</strong> button or by pressing{' '}
                <kbd>Enter</kbd>.
              </p>
              <p>If you don't answer in time, you will get zero points!</p>
              <p>
                Note: If the audio is too loud or quiet, you can adjust the volume via the controls in the bottom-right
                corner.
              </p>
            </div>
          </div>

          <div className="instruction-step">
            <NonDraggableImg
              src="/how-to-play-player-2.png"
              alt="Time bonuses and streaks preview"
            />
            <div>
              <h3>⚡ Streaks & Bonuses</h3>
              <p>
                Your answer could either be marked as <strong className="highlight correct">Correct</strong>,{' '}
                <strong className="highlight partial">Partial</strong>, or{' '}
                <strong className="highlight wrong">Wrong</strong> by the host. Correct answers will give full points,
                partially correct answers half points and wrong answers zero points.
              </p>
              <p>
                During the game, you are able to build a <span className="highlight">Streak</span>, which is displayed
                next to your name in the player list. Each correct answer will increase your streak by 1, while
                partially correct answers will keep your current streak. If your answer is wrong, you will lose your
                entire streak!
              </p>
              <p>A variety of bonuses can be awarded after each round:</p>
              <ul>
                <li>
                  <div>
                    <strong>Time Bonus</strong>
                    <span>
                      The first player with at least a partially correct answer receives the full time bonus, which then
                      starts decaying for subsequent (partially) correct answers.
                    </span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>First Correct Answer Bonus</strong>
                    <span>Awarded for the first player to give a fully correct answer.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Streak Bonus</strong>
                    <span>
                      Awarded for building streaks. From a streak of 2 onwards, you will get a bonus which increases
                      with every subsequent streak level you achieve.
                    </span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Streak Breaker Bonus</strong>
                    <span>
                      If another player loses their streak, all other players with a correct answer will receive a bonus
                      proportional to the magnitude of the broken streak(s).
                    </span>
                  </div>
                </li>
              </ul>
              <p>
                A table with the exact points calculation and a plot with the time bonus distribution can be seen when
                clicking <strong>See score details</strong>.
              </p>
              <p>
                Note: The host may adjust the balancing between all of the aforementioned bonuses to their liking, as
                well as disable individual bonuses entirely. Therefore, watch out for the settings your host has chosen
                before the game starts!
              </p>
            </div>
          </div>

          <div className="instruction-step">
            <NonDraggableImg
              src="/how-to-play-player-3.png"
              alt="Jokers preview"
            />
            <div>
              <h3>❓ Jokers</h3>
              <p>Depending on the game settings, you have the following jokers to help you:</p>
              <ul>
                {ALL_JOKER_ICONS.map(Icon => {
                  return (
                    <li
                      key={Icon.jokerType}
                      className="joker-list-item"
                    >
                      <div className="joker-indicator">
                        <Icon size={20} />
                      </div>
                      <div>
                        <strong>{capitalize(Icon.jokerType)}: </strong>
                        <span>{Icon.description}.</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="instruction-step">
            <NonDraggableImg
              src="/how-to-play-player-4.png"
              alt="Final results preview"
            />
            <div>
              <h3>🏆 Final Results</h3>
              <p>After all rounds have been played, it's time for the final results!</p>
              <p>
                If achievement bonuses are activated, the best (or worst) players will receive some additional points,
                e.g. for highest streak or fastest correct guess.
              </p>
              <p>The player with the most points wins. Good luck!</p>
            </div>
          </div>
        </div>
      )}

      {activeTab.value === 'host' && (
        <div className="instructions-tab-content">
          <div className="instruction-step">
            <NonDraggableImg
              src="/how-to-play-host-1.png"
              alt="Host setup configuration preview"
            />
            <div>
              <h3>⚙️ Game Setup</h3>
              <p>As host you have to set the rules before the game starts:</p>
              <ul>
                <li>
                  <div>
                    <strong>Number of Rounds</strong>
                    <span>Each round consists of a distinct track that players have to guess.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Max Guess Time</strong>
                    <span>
                      The time players have to submit their answer. Once the time expires, the round will end
                      automatically.
                    </span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Active Jokers</strong>
                    <span>Each Joker can be turned on or off.</span>
                  </div>
                </li>
              </ul>
              <p>You can also fine-tune the rules by opening the Advanced Settings:</p>
              <ul>
                <li>
                  <div>
                    <strong>Time Bonus</strong>
                    <span>
                      Choose how the time bonus decays over time (e.g. Linear, Exponential, etc.), or turn it off
                      completely.
                    </span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>First Correct Answer Bonus</strong>
                    <span>Awarded for the first fully correct player in each round.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Streak Bonus</strong>
                    <span>
                      Awarded for building streaks. From a streak of 2 onwards, players will get a bonus which increases
                      with every subsequent streak level they achieve.
                    </span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Achievement Bonus</strong>
                    <span>
                      Awarded at the end of the game to the player with e.g. the highest streak or the fastest correct
                      answer. You can select specific bonuses to be awarded, choose a number of randomly selected
                      bonuses or turn of achievement bonuses entirely.
                    </span>
                  </div>
                </li>
              </ul>
              <p>
                You can also transfer the host role to another player. You will then participate in the game as a
                player.
              </p>
            </div>
          </div>

          <div className="instruction-step">
            <NonDraggableImg
              src="/how-to-play-host-2.png"
              alt="Track selection preview"
            />
            <div>
              <h3>🎵 Track Selection</h3>
              <p>For each round, you have to select a track, for which players have to guess the game of origin.</p>
              <p>
                You can filter tracks by tags and playlists (if present), order tracks alphabetically and search for
                keywords in game or track title. You can also filter out previously played tracks.
              </p>
              <p>If you cannot decide, you can choose a random track from the current filtered track list.</p>
              <p>Note: Every track can only be played once per game!</p>
            </div>
          </div>

          <div className="instruction-step">
            <NonDraggableImg
              src="/how-to-play-host-3.png"
              alt="Review answers preview"
            />
            <div>
              <h3>📋 Review Answers</h3>
              <p>If every player has answered or time is up, you have to review the players' answers.</p>
              <p>
                You can mark each answer as <strong className="highlight correct">Correct</strong>,{' '}
                <strong className="highlight partial">Partial</strong>, or{' '}
                <strong className="highlight wrong">Wrong</strong>. Correct answers will give full points, partially
                correct answers half points and wrong answers zero points. Players who did not submit a guess in time
                will be listed at the bottom and will automatically receive zero points.
              </p>
              <p>If you are finished with reviewing the answers, you can submit your corrections to the players.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
