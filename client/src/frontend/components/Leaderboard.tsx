import { capitalize, getAvatarUrl, getDisplayName, type Participant } from '@yasq/shared';
import { findUser } from '../../utils/helper';
import { RoundBubblesGroup } from './RoundBubble';
import { DiscordAvatar } from './DiscordAvatar';
import { TooltipDiv } from './Tooltip';

interface LeaderboardProps {
  leaderboard: any[];
  achievements: Record<string, any>;
  participants: Participant[];
}

export const Leaderboard = ({ leaderboard, achievements, participants }: LeaderboardProps) => {
  const totalPlayers = leaderboard.length;

  return (
    <div className="leaderboard-container">
      {leaderboard.map((player, index) => {
        const user = findUser(participants, player.userId);

        const staggerIndex = totalPlayers - 1 - index;
        const delay = staggerIndex * 1.5;
        const isWinner = index === 0;
        const isSecond = index === 1;
        const isThird = index === 2;

        const playerAchievements = Object.entries(achievements || {}).filter(
          ([_, state]: [string, any]) =>
            state?.userIds &&
            state.userIds.includes(player.userId) &&
            player.achievementBonuses &&
            player.achievementBonuses.has(state.rule.id)
        );

        return (
          <div
            key={player.userId}
            className="player-wrapper"
            style={{ animationDelay: `${delay}s` }}
          >
            <div
              className={`player-card ${isWinner ? 'winner' : ''} ${isSecond ? 'second' : ''} ${isThird ? 'third' : ''}`}
              style={{
                animationDelay: `${delay + 0.4}s`,
                zIndex: 1000 - index,
              }}
            >
              {isWinner && <div className="shimmer-layer" />}
              <div className="player-main-info">
                <div className="rank">#{index + 1}</div>
                <DiscordAvatar
                  src={getAvatarUrl(user)}
                  userName={getDisplayName(user)}
                />
                <div className="name">
                  {isWinner ? '👑 ' : ''}
                  {getDisplayName(user)}
                </div>

                {playerAchievements.length > 0 && (
                  <div className="player-achievements">
                    {playerAchievements.map(([ruleId, state]: [string, any], aIndex: number) => {
                      const points = state.rule?.reward || 0;
                      const label = capitalize(ruleId);
                      const icon =
                        state.rule?.metric === 'streak' ? '🔥' : state.rule?.metric === 'guessTime' ? '⌚' : '🏆';

                      const tooltipId = `${player.userId}-${aIndex}`;

                      return (
                        <TooltipDiv
                          key={tooltipId}
                          id={tooltipId}
                          text={`${label} (+${points} pts)`}
                          className="badge winner"
                        >
                          {icon} +{points}
                        </TooltipDiv>
                      );
                    })}
                  </div>
                )}

                <div className="total-score">{player.totalScore} pts</div>
              </div>

              <div className="history-grid">
                <div className="history-label">Round Breakdown:</div>
                <RoundBubblesGroup
                  rounds={player.roundHistory}
                  userId={player.userId}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
