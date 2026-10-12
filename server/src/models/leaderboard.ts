import { type AchievementBonusType, type PointsBonus, type TimeBonusSummary } from '@yasq/shared';

export class RoundResult {
  constructor(
    public round: number,
    public guess: string | undefined,
    public points: number | null,
    public scoreValue: number,
    public isFirst: boolean,
    public time: number | null,
    public awardedBonuses: PointsBonus[] = []
  ) {}
}

export type UserRoundResult = {
  userId: string;
} & RoundResult;

export class LeaderboardEntry {
  public userId: string;
  public totalScore: number = 0;
  public roundHistory: RoundResult[] = [];
  public achievementBonuses: Map<AchievementBonusType, number> = new Map<AchievementBonusType, number>();

  constructor(userId: string) {
    this.userId = userId;
  }

  addRound(result: RoundResult) {
    const alreadyExists = this.roundHistory.some(r => r.round === result.round);
    if (alreadyExists) return;

    this.roundHistory.push(result);
    this.recalculateTotal();
  }

  addAchievementBonus(type: AchievementBonusType, reward: number) {
    this.achievementBonuses.set(type, reward);
    this.recalculateTotal();
  }

  private recalculateTotal() {
    const roundPoints = this.roundHistory.reduce((sum, r) => sum + (r.points || 0), 0);
    const achievementPoints = Array.from(this.achievementBonuses.values()).reduce((sum, reward) => sum + reward, 0);
    this.totalScore = roundPoints + achievementPoints;
  }

  toJSON() {
    return {
      ...this,
      achievementBonuses: Array.from(this.achievementBonuses),
    };
  }

  static fromJSON(data: any): LeaderboardEntry {
    const entry = new LeaderboardEntry(data.userId);
    entry.roundHistory = (data.roundHistory || []).map(
      (r: any) => new RoundResult(r.round, r.guess, r.points, r.scoreValue, r.isFirst, r.time, r.awardedBonuses)
    );
    entry.achievementBonuses = new Map<AchievementBonusType, number>(
      data.achievementBonuses ? (Object.entries(data.achievementBonuses) as [AchievementBonusType, number][]) : []
    );
    entry.recalculateTotal();
    return entry;
  }
}

export class RoundSummary {
  public round: number;
  public timeBonusSummary: TimeBonusSummary | null;

  constructor(round: number) {
    this.round = round;
    this.timeBonusSummary = null;
  }
}

export class Leaderboard {
  private readonly entries: LeaderboardEntry[] = [];
  private readonly roundSummaries: RoundSummary[] = [];

  constructor(entries: LeaderboardEntry[] = [], roundSummaries: RoundSummary[] = []) {
    this.entries = entries;
    this.roundSummaries = roundSummaries;
  }

  public hasEntry(userId: string): boolean {
    return this.entries.some(e => e.userId === userId);
  }

  public getEntry(userId: string): LeaderboardEntry | undefined {
    return this.entries.find(e => e.userId === userId);
  }

  public getOrCreate(userId: string): LeaderboardEntry {
    if (!this.hasEntry(userId)) {
      this.addEntry(new LeaderboardEntry(userId));
    }
    return this.getEntry(userId)!;
  }

  // Add an entry and maintain the sorted order
  public addEntry(entry: LeaderboardEntry): void {
    this.entries.push(entry);
  }

  public addSummary(summary: RoundSummary): void {
    this.roundSummaries.push(summary);
  }

  public sort(): void {
    this.entries.sort((a, b) => b.totalScore - a.totalScore);
  }

  public getAll(): LeaderboardEntry[] {
    return this.entries;
  }

  public getWinnerId(): string | null {
    return this.entries[0]?.userId || null;
  }

  public getRoundOverview(round: number): { userId: string; points: number }[] {
    return this.entries.map(entry => {
      const roundResult = entry.roundHistory.find(r => r.round === round);
      return {
        userId: entry.userId,
        points: roundResult?.points || 0,
      };
    });
  }

  public getRoundResults(round: number, userId?: string): UserRoundResult[] {
    const entries = userId ? this.entries.filter(e => e.userId === userId) : this.entries;

    return entries
      .map(entry => {
        const r = entry.roundHistory.findLast(rh => rh.round === round);
        return {
          userId: entry.userId,
          round: round,
          guess: r?.guess ?? undefined,
          points: r?.points ?? null,
          scoreValue: r?.scoreValue ?? 0.0,
          isFirst: r?.isFirst ?? false,
          time: r?.time ?? null,
          awardedBonuses: r?.awardedBonuses ?? [],
        };
      })
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  }

  public getRoundSummary(round: number) {
    return this.roundSummaries.findLast(summary => summary.round === round) ?? null;
  }

  static fromJSON(data: any): Leaderboard {
    const entries = (data?.entries || []).map((e: any) => LeaderboardEntry.fromJSON(e));
    return new Leaderboard(entries, data?.roundSummaries || []);
  }
}
