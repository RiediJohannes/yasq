import { BASE_POINTS, BonusType, PointsBonus } from "@yasq/shared";
import { h } from 'preact';

const BONUS_LABELS: Record<BonusType, string> = {
  [BonusType.TIME_BONUS]: 'Time bonus',
  [BonusType.FIRST_BONUS]: 'First bonus',
  [BonusType.STREAK_BONUS]: 'Streak bonus',
  [BonusType.STREAK_BREAKER]: 'Streak breaker bonus',
};

class PointsCalculationEntry {
  constructor(
    public title: string,
    public points: number,
  ) {}
}


interface BonusTableProps {
  baseMultiplier: number;
  awardedBonuses: PointsBonus[];
}

export const PointsCalculationTable = ({ baseMultiplier, awardedBonuses }: BonusTableProps) => {
  const awardedBasePoints = BASE_POINTS * baseMultiplier;

  // Show simple message instead of a table if no bonuses were awarded
  if (awardedBonuses.length === 0) {
    return <span className="empty-points-table">No bonuses awarded. {awardedBasePoints} points is your total.</span>;
  }

  const calculationEntries: PointsCalculationEntry[] = [
    new PointsCalculationEntry("Base points", awardedBasePoints),
    ...awardedBonuses.map((bonus) =>
      new PointsCalculationEntry(BONUS_LABELS[bonus.type], awardedBasePoints * bonus.multiplier))
  ];

  const totalPoints = calculationEntries.reduce((sum, item) => sum + item.points, 0);

  return (
    <table className="points-table">
      <tbody>
        {calculationEntries.map((entry, idx) => {
          const isFirst = idx === 0;
          return (
            <tr key={entry.title} className={isFirst ? "base-row" : "bonus-row"}>
              <td className="label-col">{entry.title}</td>
              <td className="points-col">
                {isFirst ? '' : '+ '}
                {entry.points}
              </td>
              <td className="unit-col">pt.</td>
            </tr>
          );
        })}

        <tr className="total-row">
          <td className="label-col">Total:</td>
          <td className="points-col">{totalPoints}</td>
          <td className="unit-col">pt.</td>
        </tr>
      </tbody>
    </table>
  );
}