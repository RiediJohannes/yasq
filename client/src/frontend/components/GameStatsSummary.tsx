import { capitalize, getAvatarUrl, getDisplayName, Participant } from '@yasq/shared';
import { findUser, getGameDuration } from '../../utils/helper';
import { DiscordAvatar } from './DiscordAvatar';

export const GameStatsSummary = ({
  stats,
  achievements,
  participants,
}: {
  stats: any;
  achievements: Record<string, any>;
  participants: Participant[];
}) => {
  const highestTimeBonus = stats.bestScoringRound?.timeBonusSum ?? 0;
  const leastTimeBonus = stats.leastScoringRound?.timeBonusSum ?? 0;

  const statItems: Array<{
    label: string;
    users: Participant[];
    value: string | string[];
    subValue?: string;
  }> = [
    {
      label: 'Duration',
      users: [],
      value: getGameDuration(stats.startTime, stats.endTime),
    },
    {
      label: 'Best Round',
      users: [],
      value: stats.bestScoringRound ? `Round ${stats.bestScoringRound.roundResults[0]?.round || 'N/A'}` : 'N/A',
      subValue: `${highestTimeBonus} pts`,
    },
    {
      label: 'Least Round',
      users: [],
      value: stats.leastScoringRound ? `Round ${stats.leastScoringRound.roundResults[0]?.round || 'N/A'}` : 'N/A',
      subValue: `${leastTimeBonus} pts`,
    },
    ...Object.entries(achievements).map(([ruleId, state]: [string, any]) => {
      const users = state.userIds.map((id: string) => findUser(participants, id)).filter(Boolean);
      const ruleName = capitalize(ruleId);

      return {
        label: ruleName,
        users,
        value: users.length > 0 ? users.map((u: Participant) => getDisplayName(u)) : ['None'],
        subValue: formatSubValue(state),
      };
    }),
  ];

  return (
    <div className="game-stats">
      <h2>📊 Game Highlights</h2>
      <div className="game-stats-grid">
        {statItems.map((item, index) => {
          const users = item.users || [];
          const values = Array.isArray(item.value) ? item.value : [item.value];

          return (
            <div
              key={index}
              className="game-stat-item"
            >
              <span className="game-stat-label">{item.label}</span>
              {users.length > 0 ? (
                users.map((user: Participant, uIndex: number) => {
                  const userName = getDisplayName(user);
                  const avatarUrl = getAvatarUrl(user);
                  const displayValue = values[uIndex] || userName;
                  return (
                    <div
                      key={uIndex}
                      className="game-stat-content"
                    >
                      <DiscordAvatar
                        src={avatarUrl}
                        userName={userName}
                        tiny={true}
                        hasTooltip={false}
                      />
                      <strong className="game-stat-value">{displayValue}</strong>
                    </div>
                  );
                })
              ) : (
                <div className="game-stat-content">
                  <strong className="game-stat-value">{item.value}</strong>
                </div>
              )}
              {item.subValue && <span className="game-stat-subvalue">{item.subValue}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function formatSubValue(state: any): string {
  if (!state.value && state.value !== 0) return '';

  if (state.rule && state.rule.metric === 'guessTime') {
    if (state.rule.aggregate === 'average') {
      return `⌚ ${state.value.toFixed(1)}s`;
    }
    return `⌚ ${state.value.toFixed(1)}s (Round ${state.extraData?.round || 'N/A'})`;
  }

  if (state.rule && state.rule.metric === 'streak') {
    return `🔥 ${state.value}`;
  }

  return `${state.value}`;
}
