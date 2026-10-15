import {
  AchievementStateDto,
  capitalize,
  GameStatsDto,
  getAvatarUrl,
  getDisplayName,
  Participant,
  TrackInfo,
} from '@yasq/shared';
import { findUser, getGameDuration } from '../../utils/helper';
import { DiscordAvatar } from './DiscordAvatar';
import { NonDraggableImg } from './NonDraggableImg';
import { TooltipDiv } from './Tooltip';

export const GameStatsSummary = ({
  stats,
  achievements,
  participants,
}: {
  stats: GameStatsDto;
  achievements: Record<string, AchievementStateDto>;
  participants: Participant[];
}) => {
  const highestTimeBonus = stats.bestScoringRound?.timeBonusSum ?? 0;
  const leastTimeBonus = stats.leastScoringRound?.timeBonusSum ?? 0;

  const statItems: Array<{
    label: string;
    users: Participant[];
    value: string | string[];
    subValue?: string;
    tooltipText?: string;
    trackInfo?: TrackInfo;
  }> = [
    {
      label: 'Game Duration',
      users: [],
      value: getGameDuration(stats.startTime, stats.endTime),
      tooltipText: `Start: ${formatTimestamp(stats.startTime)}\nEnd: ${formatTimestamp(stats.endTime)}`,
    },
    {
      label: 'Best Round',
      users: [],
      value: stats.bestScoringRound ? `Round ${stats.bestScoringRound.roundResults[0]?.round || 'N/A'}` : 'N/A',
      subValue: `${highestTimeBonus} pts`,
      tooltipText: 'The easiest track for the group, featuring the most fastest correct guesses.',
      trackInfo: stats.bestScoringRound?.trackInfo,
    },
    {
      label: 'Worst Round',
      users: [],
      value: stats.leastScoringRound ? `Round ${stats.leastScoringRound.roundResults[0]?.round || 'N/A'}` : 'N/A',
      subValue: `${leastTimeBonus} pts`,
      tooltipText: 'The hardest track for the group, featuring the fewest and slowest correct guesses.',
      trackInfo: stats.leastScoringRound?.trackInfo,
    },
    ...Object.entries(achievements).map(([ruleId, state]: [string, AchievementStateDto]) => {
      const users = state.userIds.map((id: string) => findUser(participants, id)).filter(Boolean);
      const ruleName = capitalize(ruleId);

      return {
        label: ruleName,
        users,
        value: users.length > 0 ? users.map((u: Participant) => getDisplayName(u)) : ['None'],
        subValue: formatSubValue(state),
        tooltipText: state.rule.description,
        trackInfo: state.extraData?.trackInfo,
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

          const content = (
            <>
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
            </>
          );

          return item.trackInfo || item.tooltipText ? (
            <TooltipDiv
              text={
                <div class="game-stat-tooltip-content">
                  {item.tooltipText && <span className="game-stat-tooltip-text">{item.tooltipText}</span>}
                  {item.tooltipText && item.trackInfo && <hr className="game-stat-divider" />}
                  {item.trackInfo && (
                    <div className="game-stat-track-container">
                      <NonDraggableImg
                        src={item.trackInfo.gameCoverUrl || '/default.svg'}
                        alt={`Cover of ${item.trackInfo.track.game}`}
                        onError={e => {
                          (e.currentTarget as HTMLImageElement).src = '/default.svg';
                        }}
                      />
                      <div className="game-stat-track-details">
                        <span>
                          <strong>{item.trackInfo.track.game}</strong>
                        </span>
                        <span>
                          <i>{item.trackInfo.track.title}</i>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              }
              key={index}
              className="game-stat-item tooltip-game-stat-item"
            >
              {content}
            </TooltipDiv>
          ) : (
            <div
              key={index}
              className="game-stat-item"
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function formatSubValue(state: AchievementStateDto): string {
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

const formatTimestamp = (timestamp?: string | number): string => {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);

  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
