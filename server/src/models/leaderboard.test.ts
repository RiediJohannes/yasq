import { describe, expect, it } from 'vitest';
import { Leaderboard, LeaderboardEntry, RoundResult } from './leaderboard.js';

function makeRound(round: number, points: number | null, isFirst: boolean, time: number | null): RoundResult {
  return new RoundResult(round, 'guess', points, 1.0, isFirst, time);
}

function makeEntry(userId: string, rounds: RoundResult[]): LeaderboardEntry {
  const entry = new LeaderboardEntry(userId);
  for (const r of rounds) {
    entry.addRound(r);
  }
  return entry;
}

describe('LeaderboardEntry - addAchievementBonus', () => {
  it('should combine achievement bonuses with existing round points', () => {
    const player1 = makeEntry('Player1', [
      makeRound(1, 100, false, 20),
      makeRound(2, 50, false, 15),
      makeRound(3, 150, true, 10),
    ]);
    player1.addAchievementBonus('Achievement Bonus A', 50);
    player1.addAchievementBonus('Achievement Bonus B', 50);

    expect(player1.totalScore).toBe(400);
  });
});

describe('Leaderboard - sort', () => {
  it('should sort primarily by totalScore descending', () => {
    const player1 = makeEntry('Player1', [
      makeRound(1, 100, false, 20),
      makeRound(2, 50, false, 15),
      makeRound(3, 150, true, 10),
    ]);
    const player2 = makeEntry('Player2', [
      makeRound(1, 200, true, 5),
      makeRound(2, 150, true, 10),
      makeRound(3, 50, false, 20),
    ]);
    const player3 = makeEntry('Player3', [
      makeRound(1, 150, false, 10),
      makeRound(2, 100, false, 20),
      makeRound(3, 100, false, 15),
    ]);

    const leaderboard = new Leaderboard([player1, player2, player3]);
    leaderboard.sort();

    expect(leaderboard.getAll().map(e => e.userId)).toEqual(['Player2', 'Player3', 'Player1']);
  });

  it('should break ties in totalScore by most isFirst counts descending', () => {
    // Both have 400 total points, but Player2 was first twice vs Player1 once
    const player1 = makeEntry('Player1', [
      makeRound(1, 100, false, 20),
      makeRound(2, 150, false, 15),
      makeRound(3, 150, true, 10),
    ]);
    const player2 = makeEntry('Player2', [
      makeRound(1, 200, true, 5),
      makeRound(2, 150, true, 10),
      makeRound(3, 50, false, 20),
    ]);

    const leaderboard = new Leaderboard([player1, player2]);
    leaderboard.sort();

    expect(leaderboard.getAll().map(e => e.userId)).toEqual(['Player2', 'Player1']);
  });

  it('should break ties in both totalScore and isFirst count by lowest overall time ascending', () => {
    // Both have 350 total points and 1 isFirst, but Player2 was faster overall
    const player1 = makeEntry('Player1', [
      makeRound(1, 150, false, 20),
      makeRound(2, 200, true, 5), // 25 seconds total
    ]);
    const player2 = makeEntry('Player2', [
      makeRound(1, 200, true, 5),
      makeRound(2, 150, false, 15), // 20 seconds total
    ]);

    const leaderboard = new Leaderboard([player1, player2]);
    leaderboard.sort();

    expect(leaderboard.getAll().map(e => e.userId)).toEqual(['Player2', 'Player1']);
  });
});
