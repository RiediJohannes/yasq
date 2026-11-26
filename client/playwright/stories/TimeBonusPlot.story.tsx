import { useState } from 'preact/hooks';

import {
  MAX_TIME_MULTIPLIER,
  MIN_TIME_MULTIPLIER,
  type Participant,
  type PlayerTimeBonusPoint,
  TimeBonus,
  type TimeBonusPoint,
  type TimeBonusSummary,
} from '@yasq/shared';
import { BackendContext } from '@globals';
import { TimeBonusPlot } from '@components/TimeBonusPlot';

import { AuthenticationResult, BackendApiFacade, TimeBonusPlotPayload } from '../../src/backend/apiFacade';
import { useTimeBonusSamples } from '../../src/frontend/hooks/useTimeBonusSamples';

export enum GuessCorrection {
  CORRECT = 'correct',
  PARTIAL = 'partial',
  INCORRECT = 'incorrect',
}

export interface PlayerGuessResult {
  playerId: string;
  time: number;
  correction: GuessCorrection;
}

export const SAMPLE_PARTICIPANTS: Participant[] = [
  { id: '1000000001000000001', username: 'alice_wav', nickname: 'Alice' },
  { id: '2000000001000000001', username: 'bobbytables', nickname: 'Bob' },
  { id: '3000000001000000001', username: 'charlie_dev', nickname: 'Charlie' },
  { id: '4000000001000000001', username: 'dana.codes', nickname: 'Dana' },
  { id: '5000000001000000001', username: 'eli_music', nickname: 'Elias' },
  { id: '6000000001000000001', username: 'fiona_quiz', nickname: 'Fiona' },
  { id: '7000000001000000001', username: 'greta_g', nickname: 'Greta' },
  { id: '8000000001000000001', username: 'hugo_beats', nickname: 'Hugo' },
  { id: '9000000001000000001', username: 'ines_trivia', nickname: 'Ines' },
  { id: '1100000001000000001', username: 'jonas_j', nickname: 'Jonas' },
  { id: '1200000001000000001', username: 'klara_k', nickname: 'Klara' },
  { id: '1300000001000000001', username: 'leo_lyrics', nickname: 'Leo' },
];

const DEFAULT_GUESSES: PlayerGuessResult[] = [
  { playerId: '1000000001000000001', time: 3800, correction: GuessCorrection.CORRECT },
  { playerId: '2000000001000000001', time: 6800, correction: GuessCorrection.CORRECT },
  { playerId: '3000000001000000001', time: 9100, correction: GuessCorrection.PARTIAL },
  { playerId: '4000000001000000001', time: 16900, correction: GuessCorrection.INCORRECT },
  { playerId: '5000000001000000001', time: 24100, correction: GuessCorrection.CORRECT },
  { playerId: '6000000001000000001', time: 28000, correction: GuessCorrection.PARTIAL },
];
const DEFAULT_TOTAL_TIME: number = 30_000;
const DEFAULT_SAMPLES: number = 200;

type TimeMultiplierFunction = (evaluationTime: number, firstSuccessTime: number, totalTime: number) => number;

const LinearTimeMultiplier: TimeMultiplierFunction = (elapsed, first, total) => {
  const decayFraction = (elapsed - first) / (total - first);
  return 1 - decayFraction;
};

function calculateTimeMultiplier(
  evaluationTime: number,
  firstSuccessTime: number,
  totalTime: number,
  multiplierFunction: TimeMultiplierFunction = LinearTimeMultiplier
): number {
  // Stay constant at MAX until the first successful answer
  // Stay constant at MAX until the first successful answer
  if (evaluationTime <= firstSuccessTime || evaluationTime <= 0) {
    return MAX_TIME_MULTIPLIER;
  }
  // Stay constant at MIN from the end of the round
  if (evaluationTime >= totalTime || totalTime <= firstSuccessTime) {
    return MIN_TIME_MULTIPLIER;
  }

  const bonusFraction = multiplierFunction(evaluationTime, firstSuccessTime, totalTime);
  const multiplier = MIN_TIME_MULTIPLIER + (MAX_TIME_MULTIPLIER - MIN_TIME_MULTIPLIER) * bonusFraction;

  return Math.min(MAX_TIME_MULTIPLIER, Math.max(MIN_TIME_MULTIPLIER, multiplier));
}

function generateSampleTimeBonusSummary(
  playerGuesses: PlayerGuessResult[],
  numberOfSamples: number,
  totalTime: number = 60_000
): TimeBonusSummary {
  const fastestSuccessTime = Math.min(
    ...playerGuesses.filter(g => g.correction !== GuessCorrection.INCORRECT).map(g => g.time)
  );

  // Precompute time bonus curve samples
  const curvePoints: TimeBonusPoint[] = [];
  for (let i = 0; i <= numberOfSamples; i++) {
    const sampleTime = (i / numberOfSamples) * totalTime;
    curvePoints.push({
      time: sampleTime,
      multiplier: calculateTimeMultiplier(sampleTime, fastestSuccessTime, totalTime),
    });
  }

  const playerGuessTimes: PlayerTimeBonusPoint[] = playerGuesses.map(g => ({
    playerId: g.playerId,
    time: g.time,
    multiplier:
      g.correction !== GuessCorrection.INCORRECT
        ? calculateTimeMultiplier(g.time, fastestSuccessTime, totalTime)
        : null,
    fullyCorrect: g.correction === GuessCorrection.CORRECT,
  }));

  return { totalTime, curvePoints, playerGuessTimes };
}

interface PlotComponentProps {
  data: TimeBonusPlotPayload;
  currentPlayer: Participant | null;
  placeOffscreen?: boolean;
}

const PlotStoryContent = ({ data, currentPlayer, placeOffscreen = false }: PlotComponentProps) => {
  const [escapeCount, setEscapeCount] = useState(0);
  const pageMarkerStyles = { display: 'block', width: '100%', textAlign: 'center', margin: '20px auto' };

  return (
    <div
      id="plot-base"
      style={{ maxWidth: 'min(700px, 90%)', margin: '0 auto' }}
      onKeyDown={e => {
        if (e.key === 'Escape') setEscapeCount(count => count + 1);
      }}
    >
      <div
        id="before-plot"
        tabIndex={0}
        style={pageMarkerStyles}
      >
        Before plot
      </div>

      {placeOffscreen && <div style={{ height: '120vh' }} />}

      <div id="plot-container">
        {data ? (
          <TimeBonusPlot
            participants={data.participants}
            data={data.timeBonusSummary}
            currentPlayer={currentPlayer}
          />
        ) : (
          <span id="samples-loading">Loading samples…</span>
        )}
      </div>

      {placeOffscreen && <div style={{ height: '120vh' }} />}

      <div
        id="after-plot"
        tabIndex={0}
        style={pageMarkerStyles}
      >
        After plot
      </div>

      <span style={{ marginRight: '1em' }}>Escape events at parent:</span>
      <output id="escape-count">{escapeCount}</output>

      {data && (
        <div
          id="plot-data"
          hidden
          data-payload={JSON.stringify({ ...data, currentPlayerId: currentPlayer?.id ?? null })}
        />
      )}
    </div>
  );
};

interface PlotStoryProps {
  currentPlayer?: Participant | null;
  placeOffscreen?: boolean;
}

const PlotWithDefaultData = (storySettings: PlotStoryProps = {}) => {
  const { currentPlayer = null, placeOffscreen } = storySettings;

  const data = {
    participants: SAMPLE_PARTICIPANTS,
    timeBonusSummary: generateSampleTimeBonusSummary(DEFAULT_GUESSES, DEFAULT_SAMPLES, DEFAULT_TOTAL_TIME),
  };

  return (
    <PlotStoryContent
      data={data}
      currentPlayer={currentPlayer}
      placeOffscreen={placeOffscreen}
    />
  );
};

export interface CustomPlotData {
  guesses: PlayerGuessResult[];
  samples: number;
  totalTime: number;
}

const PlotWithCustomData = (customData: CustomPlotData, storySettings: PlotStoryProps = {}) => {
  const { currentPlayer = null, placeOffscreen } = storySettings;

  const data = {
    participants: SAMPLE_PARTICIPANTS,
    timeBonusSummary: generateSampleTimeBonusSummary(customData.guesses, customData.samples, customData.totalTime),
  };

  return (
    <PlotStoryContent
      data={data}
      currentPlayer={currentPlayer}
      placeOffscreen={placeOffscreen}
    />
  );
};

// Minimal backend facade for the useTimeBonusSamples hook to work
const mockFacade = new BackendApiFacade('mock_instance', {
  access_token: 'test_token',
  user: { id: 'test_user', username: 'TestUser' },
  expires: 'never',
} as AuthenticationResult);

interface HookPlotProps {
  bonusType: TimeBonus;
  placeOffscreen: boolean;
}

// The hook reads the backend from the context, so it has to run in a component below the provider
const HookPlot = ({ bonusType, placeOffscreen }: HookPlotProps) => {
  const { timeBonusSamples } = useTimeBonusSamples();

  // Samples are fetched asynchronously. Reading the signal's value re-renders the story once they have arrived.
  const data = timeBonusSamples.value.get(bonusType);

  return data ? (
    <PlotStoryContent
      data={data}
      currentPlayer={null}
      placeOffscreen={placeOffscreen}
    />
  ) : (
    <span id="samples-loading">Loading samples…</span>
  );
};

const PlotWithHookData = (bonusType: TimeBonus, placeOffscreen: boolean = false) => (
  <BackendContext.Provider value={mockFacade}>
    <HookPlot
      bonusType={bonusType}
      placeOffscreen={placeOffscreen}
    />
  </BackendContext.Provider>
);

/** Serializes everything the hook provides (without rendering any plot), to check the samples of all bonus types. */
const HookSamplesDump = () => {
  const { timeBonusSamples, isLoading } = useTimeBonusSamples();
  const samples = timeBonusSamples.value;

  if (samples.size === 0) return <span id="samples-loading">Loading samples…</span>;

  return (
    <div
      id="hook-samples"
      hidden
      data-payload={JSON.stringify({ isLoading: isLoading.value, samples: Object.fromEntries(samples) })}
    />
  );
};

const guess = (participantIndex: number, time: number, correction: GuessCorrection): PlayerGuessResult => ({
  playerId: SAMPLE_PARTICIPANTS[participantIndex].id,
  time,
  correction,
});

/**
 * Successful guesses between 24s and 30s of a 60s round, so that zooming is offered.
 * Zoomed in, the plot shows 23.28s - 30.72s: the successful guesses padded by 12% of their time span on both sides.
 * The incorrect guesses lie far outside (4s, 45s), just outside (23s, 31s) and inside the padding (23.6s, 30.4s)
 * of that range, and between the successful guesses (27s).
 */
const ZOOMABLE_DATA: CustomPlotData = {
  totalTime: 60_000,
  samples: 600,
  guesses: [
    guess(0, 4_000, GuessCorrection.INCORRECT),
    guess(1, 23_000, GuessCorrection.INCORRECT),
    guess(2, 23_600, GuessCorrection.INCORRECT),
    guess(3, 24_000, GuessCorrection.CORRECT),
    guess(4, 25_000, GuessCorrection.CORRECT),
    guess(5, 26_500, GuessCorrection.PARTIAL),
    guess(6, 27_000, GuessCorrection.INCORRECT),
    guess(7, 28_000, GuessCorrection.CORRECT),
    guess(8, 30_000, GuessCorrection.PARTIAL),
    guess(9, 30_400, GuessCorrection.INCORRECT),
    guess(10, 31_000, GuessCorrection.INCORRECT),
    guess(11, 45_000, GuessCorrection.INCORRECT),
  ],
};

/**
 * Successful guesses at 56s - 59.5s of a 60s round. Their padded range (4.34s) is narrower than the minimum zoom
 * window (8% = 4.8s), and centered on the guesses it would reach beyond the end of the round. So the zoomed range is
 * the last 4.8s: 55.2s - 60s. The incorrect guess at 55.25s is only visible if the window is widened and shifted back
 * into the plot, the one at 55.1s must be cut off.
 */
const ZOOMABLE_NEAR_END_DATA: CustomPlotData = {
  totalTime: 60_000,
  samples: 600,
  guesses: [
    guess(0, 20_000, GuessCorrection.INCORRECT),
    guess(1, 55_100, GuessCorrection.INCORRECT),
    guess(2, 55_250, GuessCorrection.INCORRECT),
    guess(3, 56_000, GuessCorrection.CORRECT),
    guess(4, 57_500, GuessCorrection.CORRECT),
    guess(5, 59_500, GuessCorrection.PARTIAL),
  ],
};

// ----------------------------------------------------------------------
// Exported scenarios
// ----------------------------------------------------------------------

export const Linear = () => PlotWithDefaultData();
export const LinearBeyondScreen = () => PlotWithDefaultData({ placeOffscreen: true });
export const LinearAsCorrectPlayer = () => PlotWithDefaultData({ currentPlayer: SAMPLE_PARTICIPANTS[4] });
export const LinearAsIncorrectPlayer = () => PlotWithDefaultData({ currentPlayer: SAMPLE_PARTICIPANTS[3] });

export const Zoomable = () => PlotWithCustomData(ZOOMABLE_DATA);
export const ZoomableNearEnd = () => PlotWithCustomData(ZOOMABLE_NEAR_END_DATA);

export const HookLinear = () => PlotWithHookData(TimeBonus.LINEAR);
export const HookAllSamples = () => (
  <BackendContext.Provider value={mockFacade}>
    <HookSamplesDump />
  </BackendContext.Provider>
);
