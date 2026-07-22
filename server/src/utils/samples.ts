import {
  type Participant,
  type PlayerTimeBonusPoint,
  TimeBonus,
  type TimeBonusPoint,
  type TimeBonusSummary
} from '@yasq/shared';
import { GameInstance } from "../models.js";

const HOST_ID = "host_123";
const INSTANCE_ID = "mock_instance"

export const SAMPLE_PARTICIPANTS: Participant[] = [
  { id: "1000000001000000001", username: "alice_wav",   nickname: "Alice" },
  { id: "2000000001000000001", username: "bobbytables", nickname: "Bob" },
  { id: "3000000001000000001", username: "charlie_dev", nickname: "Charlie" },
  { id: "4000000001000000001", username: "dana.codes",  nickname: "Dana" },
  { id: "5000000001000000001", username: "eli_music",   nickname: "Elias" },
  { id: "6000000001000000001", username: "fiona_quiz",  nickname: "Fiona" },
];

export function generateSampleTimeBonusSummary(bonusType: TimeBonus): TimeBonusSummary {
  const totalTime = 30_000;
  const firstSuccessTime = 3800; // earliest (partially) correct answer

  let game = new GameInstance(INSTANCE_ID, HOST_ID);
  game.settings.timeBonus = bonusType;
  game.settings.trackDuration = totalTime;

  // Precompute time bonus curve samples
  const samples = 200;
  const curvePoints: TimeBonusPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const time = (i / samples) * totalTime;
    curvePoints.push({ time, multiplier: game.calculateTimeMultiplier(time, firstSuccessTime) });
  }

  const rawGuesses = [
    { playerId: "1000000001000000001", time: 3800,  scoreValue: 1.0 },
    { playerId: "2000000001000000001", time: 6800,  scoreValue: 1.0 },
    { playerId: "3000000001000000001", time: 9100,  scoreValue: 0.5 },
    { playerId: "4000000001000000001", time: 16900, scoreValue: 1.0 },
    { playerId: "5000000001000000001", time: 24100, scoreValue: 1.0 },
    { playerId: "6000000001000000001", time: 28000, scoreValue: 0.5 },
  ];

  const playerGuessTimes: PlayerTimeBonusPoint[] = rawGuesses.map(g => ({
    playerId: g.playerId,
    time: g.time,
    multiplier: g.scoreValue > 0 ? game.calculateTimeMultiplier(g.time, firstSuccessTime) : null,
    fullyCorrect: g.scoreValue === 1.0,
  }));

  return { totalTime, curvePoints, playerGuessTimes };
}