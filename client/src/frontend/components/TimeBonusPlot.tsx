/**
 * **Developer note:** This component deals with three coordinate spaces that must not be confused:
 *
 * - **Client space:** CSS pixels in the browser viewport. This is the absolute screen position of the mouse pointer.
 * - **Plot space:** Position within the SVG plot. These are not display pixels but units of the SVG viewBox.
 * - **Domain space:** Values in the domain of the data displayed. Thus, this is time in ms for the X axis and a time
 *                     bonus multiplier (range [0,1]) for the Y axis.
 *
 * There exist simple conversions between these spaces, and coordinates are frequently mapped between these throughout
 * the file.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { memo } from 'preact/compat';

import {
  getAvatarUrl,
  getDisplayName,
  MAX_TIME_MULTIPLIER,
  MIN_TIME_MULTIPLIER,
  Participant,
  PlayerTimeBonusPoint,
  TimeBonusPoint,
  TimeBonusSummary,
} from '@yasq/shared';

import { WithTooltip } from '@components/Tooltip';
import { ZoomLens } from '@components/Icons';

import { binarySearchClosestItem, findUser, getPointerX } from '../../utils/helper';
import { useRovingTabIndex } from '../hooks/useRovingTabIndex';

enum DataPointType {
  CURVE = 'curve',
  PLAYER = 'player',
}

enum GestureDirection {
  HORIZONTAL = 'horizontal',
  VERTICAL = 'vertical',
  NONE = 'none',
}

/** A 2D point in client space (CSS pixels in the viewport) */
type ClientPoint = { x: number; y: number };
/** A 2D point in plot space (units of the SVG viewBox) */
type PlotPoint = { x: number; y: number };

/** A data point of the time bonus curve */
type CurvePoint = TimeBonusPoint;

/** A general representation of a data point (either a sample of the curve or a player's time bonus point). */
type DataPoint =
  { type: DataPointType.CURVE; item: CurvePoint } | { type: DataPointType.PLAYER; item: PlayerTimeBonusPoint };

/**
 * Various constants used throughout the {@link TimeBonusPlot} component to affect
 * visual styling and interaction behaviour.
 *
 * Distances are given in plot units (SVG viewBox units), unless the name says otherwise
 * (`Px` = Client pixels, `Ms` = milliseconds, `Ratio` = unitless fraction).
 */
const TimeBonusPlotSettings = {
  plot: {
    width: 600,
    height: 250,
    avatarRowHeight: 50,
  },
  yDomain: {
    min: MIN_TIME_MULTIPLIER,
    max: MAX_TIME_MULTIPLIER,
  },
  zoom: {
    /** Padding around the fastest/slowest successful guess when zoomed in, as a fraction of the zoom window's width */
    timePaddingRatio: 0.12,
    /** Maximum width of the zoom window padding on each side, as a fraction of totalTime */
    maxPaddingRatio: 0.05,
    /** Smallest allowed zoom window, as a fraction of totalTime */
    minZoomWindowRatio: 0.08,
    /** Largest zoom window that is meaningful enough to show the zoom button */
    maxZoomWindowRatio: 0.9,
  },
  interaction: {
    /** Snap to the closest player marker when it is within this many plot units of the hovering cursor */
    playerSnapThresholdPlotUnits: 16,
    /** Minimum touch movement (in px) before a gesture movement direction is asserted */
    gestureDirectionThresholdPx: 4,
    /**
     * A gesture only counts as vertical if vertical movement exceeds horizontal movement by this factor
     * (>1 favours classification as horizontal)
     */
    horizontalGestureBias: 2,
  },
  tooltip: {
    /** Vertical lift of the tooltip above its data point (in px) */
    topOffsetPx: 10,
    multiplierDecimals: 1,
    timeDecimals: 1,
  },
  markers: {
    nodeRadius: 5,
    /** Half-diagonal of the "incorrect guess" X marker */
    incorrectXSize: 4,
    avatarRadius: 18,
    avatarTopOffset: 12,
    /** How far below the axis the player connector line reaches */
    lineBottomOffset: 20,
    /** The tiny triangle highlighting the player's own guess on the plot */
    playerChevron: {
      halfWidth: 4.5,
      height: 10,
      yOffset: 14,
    },
  },
} as const;

const { plot, yDomain, zoom, interaction, tooltip, markers } = TimeBonusPlotSettings;
const svgHeight = plot.height + plot.avatarRowHeight;

const formatTimeInSeconds = (timeInMilliseconds: number) => (timeInMilliseconds / 1000).toFixed(tooltip.timeDecimals);

const isSameHoverTarget = (first: DataPoint, second: DataPoint) =>
  first.type === second.type &&
  first.item.time === second.item.time &&
  first.item.multiplier === second.item.multiplier;

const determineGestureDirection = (
  startPoint: ClientPoint,
  touchPoint: Touch,
  interactionThresholdPixel: number = interaction.gestureDirectionThresholdPx
): GestureDirection => {
  const dx = Math.abs(touchPoint.clientX - startPoint.x);
  const dy = Math.abs(touchPoint.clientY - startPoint.y);

  if (Math.max(dx, dy) < interactionThresholdPixel) return GestureDirection.NONE; // not enough movement to decide yet

  return dy > dx * interaction.horizontalGestureBias ? GestureDirection.VERTICAL : GestureDirection.HORIZONTAL;
};

/** Static SVG definitions (gradients and the avatar clipping mask) */
const plotDefinitions = (
  <>
    {/* Gradually fading background gradient before the curve */}
    <linearGradient
      id="curve-glow"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    >
      <stop
        offset="0%"
        stop-color="var(--color-curve)"
        stop-opacity="0.25"
      />
      <stop
        offset="100%"
        stop-color="var(--color-curve)"
        stop-opacity="0"
      />
    </linearGradient>
    {/* Additional gradient for the curve segment before the first successful guess */}
    <linearGradient
      id="max-bonus-zone-glow"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    >
      <stop
        offset="0%"
        stop-color="var(--color-curve-start, #22c55e)"
        stop-opacity="0.12"
      />
      <stop
        offset="100%"
        stop-color="var(--color-curve-start, #22c55e)"
        stop-opacity="0.01"
      />
    </linearGradient>
    {/* Clipping mask to turn avatars into round images */}
    <clipPath
      id="avatar-clip"
      clipPathUnits="objectBoundingBox"
    >
      <circle
        cx="0.5"
        cy="0.5"
        r="0.5"
      />
    </clipPath>
  </>
);

interface PlotTooltipProps {
  hoverTarget: DataPoint;
  /** Position of the hovered data point in plot space */
  plotPosition: PlotPoint;
  /** Display name of the hovered player (only relevant for player targets) */
  playerName: string | null;
  /** Colour used for the tooltip border and its highlighted texts */
  accentColor: string;
}

/**
 * Tooltip with additional information to show on the plot depending on its hover state.
 *
 * Must be rendered inside a container that is exactly as large as the SVG, because the tooltip is
 * positioned in percent of that container, which makes it independent of the SVG's rendered pixel size.
 */
const PlotTooltip = ({ hoverTarget, plotPosition, playerName, accentColor }: PlotTooltipProps) => (
  <div
    class="plot-tooltip"
    style={{
      left: `${(plotPosition.x / plot.width) * 100}%`,
      top: `calc(${(plotPosition.y / svgHeight) * 100}% - ${tooltip.topOffsetPx}px)`,
      borderColor: accentColor,
    }}
  >
    {hoverTarget.type === DataPointType.PLAYER ? (
      // Player point data tooltip
      <>
        <span
          class="tooltip-title"
          style={{ color: accentColor }}
        >
          {playerName}
        </span>
        <span
          class="tooltip-multiplier"
          style={{ color: accentColor }}
        >
          {hoverTarget.item.multiplier !== null
            ? `${(100 * hoverTarget.item.multiplier).toFixed(tooltip.multiplierDecimals)}%`
            : 'Incorrect'}
        </span>
        <span class="tooltip-time">Time: {formatTimeInSeconds(hoverTarget.item.time)}s</span>
      </>
    ) : (
      // Curve point data tooltip
      <>
        <span
          class="tooltip-multiplier"
          style={{ color: accentColor }}
        >
          {(100 * hoverTarget.item.multiplier).toFixed(tooltip.multiplierDecimals)}%
        </span>
        <span class="tooltip-time">Time: {formatTimeInSeconds(hoverTarget.item.time)}s</span>
      </>
    )}
  </div>
);

interface PlayerMarkerProps {
  /** Horizontal position of the guess in plot space */
  plotX: number;
  /** Vertical position of the guess in plot space (on the curve, or on the axis for incorrect guesses) */
  plotY: number;
  isIncorrect: boolean;
  isHovered: boolean;
  isCurrentPlayer: boolean;
  markerColor: string;
  avatarUrl: string | null;
}

/** Marker for a single player's guess. */
const PlayerMarker = memo(
  ({ plotX, plotY, isIncorrect, isHovered, isCurrentPlayer, markerColor, avatarUrl }: PlayerMarkerProps) => {
    const avatarCenterY = plot.height + markers.avatarTopOffset + markers.avatarRadius;
    const chevron = markers.playerChevron;

    return (
      <g
        class={`player-marker ${isHovered ? 'is-hovered' : ''} ${isCurrentPlayer ? 'current' : ''}`}
        style={{ '--marker-color': markerColor }}
      >
        <line
          x1={plotX}
          y1={plotY}
          x2={plotX}
          y2={plot.height + markers.lineBottomOffset}
          class="player-line"
        />

        {/* Small marker on the curve at the awarded multiplier */}
        {isIncorrect ? (
          <g
            class="player-node-x"
            transform={`translate(${plotX}, ${plot.height})`}
          >
            <line
              x1={-markers.incorrectXSize}
              y1={-markers.incorrectXSize}
              x2={markers.incorrectXSize}
              y2={markers.incorrectXSize}
            />
            <line
              x1={-markers.incorrectXSize}
              y1={markers.incorrectXSize}
              x2={markers.incorrectXSize}
              y2={-markers.incorrectXSize}
            />
          </g>
        ) : (
          <circle
            cx={plotX}
            cy={plotY}
            r={markers.nodeRadius}
            class="player-node"
          />
        )}

        {/* Player avatar at the bottom of the plot */}
        <g class="player-avatar-bundle">
          {avatarUrl !== null && (
            <image
              href={avatarUrl}
              x={plotX - markers.avatarRadius}
              y={plot.height + markers.avatarTopOffset}
              width={2 * markers.avatarRadius}
              height={2 * markers.avatarRadius}
              class="player-avatar"
              clip-path="url(#avatar-clip)"
            />
          )}
          <circle
            cx={plotX}
            cy={avatarCenterY}
            r={markers.avatarRadius}
            class="player-avatar-ring"
          />
        </g>

        {/* Tiny chevron to highlight the position of the current player */}
        {isCurrentPlayer && (
          <g transform={`translate(${plotX}, ${plotY - chevron.yOffset})`}>
            <path
              class="player-chevron"
              d={`M ${-chevron.halfWidth},${-chevron.height} L ${chevron.halfWidth},${-chevron.height} L 0,0 Z`}
            />
          </g>
        )}
      </g>
    );
  }
);

interface TimeBonusPlotProps {
  data: TimeBonusSummary | null;
  participants: Participant[];
  currentPlayer: Participant | null;
}

/**
 * An interactive plot visualizing the decay of the awarded time bonus over time as well as where each player in the
 * quiz landed on this curve.
 * @param data - The {@link TimeBonusSummary} data to visualize.
 * @param participants - A list of {@link Participant Participants} of the quiz.
 * @param currentPlayer - The {@link Participant} logged into the client where the time bonus plot is displayed.
 * @constructor
 */
export const TimeBonusPlot = ({ data, participants, currentPlayer }: TimeBonusPlotProps) => {
  if (!data) return null;

  const plotRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const touchGestureStartRef = useRef<ClientPoint | null>(null);
  const touchGestureDirectionRef = useRef<GestureDirection>(GestureDirection.NONE);

  // The data point currently targeted by the player's cursor hovering over the plot.
  const [hoverTarget, setHoverTarget] = useState<DataPoint | null>(null);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  const { totalTime, curvePoints, playerGuessTimes } = data;

  const MIN_PLAYER_SPACING_MS: number = 0.1;
  const playerGuessesSortedByTime = useMemo(
    () =>
      [...playerGuessTimes]
        // Sort player guesses by answer time, break ties with playerId
        .sort((a, b) => a.time - b.time || a.playerId.localeCompare(b.playerId))
        // Ensure that two players never have the exact same time, so both stay selectable by the pointer
        .reduce<PlayerTimeBonusPoint[]>((spacedPoints, nextPoint) => {
          const predecessorTime = spacedPoints.at(-1)?.time ?? Number.NEGATIVE_INFINITY;
          const spacedTime = Math.max(nextPoint.time, predecessorTime + MIN_PLAYER_SPACING_MS);
          spacedPoints.push({ ...nextPoint, time: spacedTime });
          return spacedPoints;
        }, []),
    [playerGuessTimes]
  );

  // answer time of the fastest and slowest player with a correct or partially correct guess
  const fastestSuccessTime = playerGuessesSortedByTime.find(guess => guess.multiplier !== null)?.time;
  const slowestSuccessTime = playerGuessesSortedByTime.findLast(guess => guess.multiplier !== null)?.time;

  const calculateZoomTimeRange = (totalTime: number, fastestSuccessTime?: number, slowestSuccessTime?: number) => {
    if (fastestSuccessTime === undefined || slowestSuccessTime === undefined) {
      return { minTime: 0, maxTime: totalTime }; // nobody succeeded -> nothing to zoom into
    }
    if (fastestSuccessTime === slowestSuccessTime) {
      return { minTime: 0, maxTime: totalTime }; // only once player succeeded -> nothing meaningful to zoom into
    }

    // Pad the time range that includes all successful guesses to the left and right, so we don't cut off right at a guess
    const successTimeSpan = slowestSuccessTime - fastestSuccessTime;
    const maxPadding = zoom.maxPaddingRatio * totalTime;
    const zoomWindowPadding = Math.min(successTimeSpan * zoom.timePaddingRatio, maxPadding);

    const zoomTimeSpan = Math.min(
      totalTime,
      Math.max(successTimeSpan + 2 * zoomWindowPadding, totalTime * zoom.minZoomWindowRatio)
    );

    const successCenterTime = (fastestSuccessTime + slowestSuccessTime) / 2;
    const minTime = Math.min(Math.max(0, successCenterTime - zoomTimeSpan / 2), totalTime - zoomTimeSpan);
    return { minTime, maxTime: minTime + zoomTimeSpan };
  };

  const { minTime: zoomMinTime, maxTime: zoomMaxTime } = calculateZoomTimeRange(
    totalTime,
    fastestSuccessTime,
    slowestSuccessTime
  );
  const isZoomMeaningful = zoomMaxTime - zoomMinTime <= totalTime * zoom.maxZoomWindowRatio;

  const minVisibleTime = isZoomed ? zoomMinTime : 0;
  const maxVisibleTime = isZoomed ? zoomMaxTime : totalTime;
  const visibleTimeSpan = maxVisibleTime - minVisibleTime;

  // Only the player guesses that are visible in the currently displayed time range
  const visiblePlayerGuessesSortedByTime = useMemo(
    () => playerGuessesSortedByTime.filter(guess => guess.time >= minVisibleTime && guess.time <= maxVisibleTime),
    [playerGuessesSortedByTime, minVisibleTime, maxVisibleTime]
  );

  const { getTabProps, handleKeyDown, setFocusedIndex } = useRovingTabIndex(visiblePlayerGuessesSortedByTime.length);

  /** Guess of the current roving tab stop. Survives blur so it can be re-located after a zoom change. */
  const tabStopGuessRef = useRef<PlayerTimeBonusPoint | null>(null);
  const showFocusedMarkerTooltip = useRef(false);

  // Re-locate the tab stop by player identity when the visible list changes - falling back to the nearest visible guess otherwise.
  useEffect(() => {
    const tabStop = tabStopGuessRef.current;
    if (!tabStop) return;

    let index = visiblePlayerGuessesSortedByTime.findIndex(g => g.playerId === tabStop.playerId);
    if (index === -1) {
      const { item: nearest } = binarySearchClosestItem(visiblePlayerGuessesSortedByTime, tabStop.time, g => g.time);
      index = nearest ? visiblePlayerGuessesSortedByTime.indexOf(nearest) : 0;
    }
    setFocusedIndex(index);
  }, [visiblePlayerGuessesSortedByTime, setFocusedIndex]);

  // Functions to convert between the domain space (time/multiplier) and plot space (SVG viewBox units),
  // dynamically adjusting to the currently visible time range
  const timeToPlotX = (time: number) => ((time - minVisibleTime) / visibleTimeSpan) * plot.width;
  const plotUnitsToMs = (plotX: number) => (plotX / plot.width) * visibleTimeSpan;
  const multiplierToPlotY = (multiplier: number) =>
    plot.height - ((multiplier - yDomain.min) / (yDomain.max - yDomain.min)) * plot.height;
  const playerGuessToPlotY = (playerGuess: PlayerTimeBonusPoint) => {
    // Incorrect guesses have no multiplier and sit on the axis
    return playerGuess.multiplier === null ? plot.height : multiplierToPlotY(playerGuess.multiplier);
  };
  /**
   * Converts an absolute X coordinate in client space (e.g. position of the user's pointer) into the corresponding
   * value in the plot's time domain, clamping at the boundaries of the currently visible time range.
   */
  const clientXtoTime = (clientXPosition: number, svgRect: DOMRect) => {
    const pointerFraction = Math.max(0, Math.min(1, (clientXPosition - svgRect.left) / svgRect.width));
    return minVisibleTime + pointerFraction * visibleTimeSpan;
  };

  // Compute the SVG path for the decaying time bonus curve, clipped by the visible time range
  const { svgCurvePath, leftCutoffPoint, rightCutoffPoint } = useMemo(() => {
    if (!curvePoints.length) return { svgCurvePath: '', leftCutoffPoint: null, rightCutoffPoint: null };

    /** Multiplier of the curve at an arbitrary time, linearly interpolated between its neighbouring points */
    const getCurveMultiplierAt = (time: number) => {
      const nextIndex = curvePoints.findIndex(pt => pt.time >= time);
      if (nextIndex === -1) return curvePoints[curvePoints.length - 1].multiplier;
      if (nextIndex === 0) return curvePoints[0].multiplier;

      const previousPoint = curvePoints[nextIndex - 1];
      const nextPoint = curvePoints[nextIndex];
      const ratio = (time - previousPoint.time) / (nextPoint.time - previousPoint.time);
      return previousPoint.multiplier + ratio * (nextPoint.multiplier - previousPoint.multiplier);
    };

    // Add artificial curve points at min and maxVisibleTime to ensure that the curve starts and ends exactly at the plot's edges
    const leftCutoffPoint = { time: minVisibleTime, multiplier: getCurveMultiplierAt(minVisibleTime) };
    const rightCutoffPoint = { time: maxVisibleTime, multiplier: getCurveMultiplierAt(maxVisibleTime) };
    const pointsToRender = [
      leftCutoffPoint,
      ...curvePoints.filter(pt => pt.time > minVisibleTime && pt.time < maxVisibleTime),
      rightCutoffPoint,
    ];

    const strings = pointsToRender.map(
      pt => `${timeToPlotX(pt.time).toFixed(1)},${multiplierToPlotY(pt.multiplier).toFixed(1)}`
    );
    return { svgCurvePath: `M ${strings.join(' L ')}`, leftCutoffPoint, rightCutoffPoint };
  }, [curvePoints, minVisibleTime, maxVisibleTime]);

  const currentPlayerId = currentPlayer?.id ?? null;

  const hoveredPlayerGuess = hoverTarget?.type === DataPointType.PLAYER ? hoverTarget.item : null;
  const hoveredPlayerId = hoveredPlayerGuess?.playerId ?? null;

  // Position of the hovered data point in plot space, derived from its domain values
  const hoverPlotPosition: PlotPoint | null = hoverTarget && {
    x: timeToPlotX(hoverTarget.item.time),
    y:
      hoverTarget.type === DataPointType.PLAYER
        ? playerGuessToPlotY(hoverTarget.item)
        : multiplierToPlotY(hoverTarget.item.multiplier),
  };

  const getPlayerName = (playerGuess: PlayerTimeBonusPoint) => {
    if (playerGuess.playerId === currentPlayerId) return 'You';
    const participant = findUser(participants, playerGuess.playerId);
    return participant !== null ? getDisplayName(participant) : 'Unknown Player';
  };

  const getGuessLabel = (guess: PlayerTimeBonusPoint) => {
    const result =
      guess.multiplier !== null ? `${(100 * guess.multiplier).toFixed(tooltip.multiplierDecimals)}%` : 'incorrect';
    return `${getPlayerName(guess)}: ${result}, ${formatTimeInSeconds(guess.time)} seconds`;
  };

  const getMarkerColor = (playerGuess: PlayerTimeBonusPoint) => {
    if (playerGuess.playerId === currentPlayerId) return 'var(--color-marker-current)';
    if (playerGuess.multiplier === null) return 'var(--color-marker-incorrect)';
    if (playerGuess.fullyCorrect) return 'var(--color-marker-correct)';
    return 'var(--color-marker-partial)';
  };

  const tooltipAccentColor = hoverTarget
    ? hoverTarget.type === DataPointType.PLAYER
      ? getMarkerColor(hoverTarget.item)
      : 'var(--color-curve)'
    : 'var(--color-plot-tooltip-border)';

  // Sort player guesses for SVG render order (last element is drawn on top)
  const playerGuessesInRenderingOrder = useMemo(
    () =>
      [...visiblePlayerGuessesSortedByTime].sort((a, b) => {
        // First, prioritize hovered player
        if (a.playerId === hoveredPlayerId) return 1;
        if (b.playerId === hoveredPlayerId) return -1;
        // Next, prioritize current player
        if (a.playerId === currentPlayerId) return 1;
        if (b.playerId === currentPlayerId) return -1;
        // Lastly, prioritize faster players
        return b.time - a.time;
      }),
    [visiblePlayerGuessesSortedByTime, hoveredPlayerId, currentPlayerId]
  );

  /** Only updates the hover target if the new target differs from the current target. */
  const updateHoverTarget = (nextHoverTarget: DataPoint) =>
    setHoverTarget(previous => (previous && isSameHoverTarget(previous, nextHoverTarget) ? previous : nextHoverTarget));

  /**
   * Handles mouse and touch pointer interactions within the plot container and updates
   * the hover state (marker and tooltip) accordingly.
   *
   * Maps the client's cursor position to the time domain, identifies the closest curve and
   * player guess point, snapping to the closest player marker if it is within a specific
   * distance threshold.
   * Finally, the function updates the hover target with the selected data item.
   */
  const handlePointerInteraction = (e: MouseEvent | TouchEvent) => {
    if (!svgRef.current || !curvePoints.length) return;

    const pointerClientX = getPointerX(e);
    if (pointerClientX === null) return;

    const pointerTime = clientXtoTime(pointerClientX, svgRef.current.getBoundingClientRect());

    // Find the closest data point of a player's guess to the pointer's position in the time domain
    const { item: closestPlayerGuess, distance: closestPlayerTimeDistance } = binarySearchClosestItem(
      visiblePlayerGuessesSortedByTime,
      pointerTime,
      playerGuess => playerGuess.time
    );

    // Snap to the closest player's data point if it is within the specified threshold from the pointer.
    const playerSnapThresholdTime = plotUnitsToMs(interaction.playerSnapThresholdPlotUnits);
    if (closestPlayerGuess !== null && closestPlayerTimeDistance <= playerSnapThresholdTime) {
      updateHoverTarget({ type: DataPointType.PLAYER, item: closestPlayerGuess });
      return;
    }

    // No player is close enough, and cursor is in bounds -> Snap to the nearest data point of the time bonus curve instead
    const { item: closestCurvePoint } = binarySearchClosestItem(
      curvePoints,
      pointerTime,
      curvePoint => curvePoint.time
    );

    if (closestCurvePoint === null) {
      return setHoverTarget(null);
    }

    // Check if the artificial cutoff points are actually closer to the pointer
    if (
      leftCutoffPoint &&
      Math.abs(pointerTime - leftCutoffPoint.time) <= Math.abs(pointerTime - closestCurvePoint.time)
    ) {
      return updateHoverTarget({ type: DataPointType.CURVE, item: leftCutoffPoint });
    }
    if (
      rightCutoffPoint &&
      Math.abs(pointerTime - rightCutoffPoint.time) <= Math.abs(pointerTime - closestCurvePoint.time)
    ) {
      return updateHoverTarget({ type: DataPointType.CURVE, item: rightCutoffPoint });
    }

    updateHoverTarget({
      type: DataPointType.CURVE,
      item: closestCurvePoint,
    });
  };

  const handleTouchStart = (e: TouchEvent) => {
    const touchPoint = e.touches[0];
    if (!touchPoint) return;

    // A new touch started -> re-initialize gesture data
    touchGestureStartRef.current = { x: touchPoint.clientX, y: touchPoint.clientY };
    touchGestureDirectionRef.current = GestureDirection.NONE;

    handlePointerInteraction(e);
  };

  const handleTouchMove = (e: TouchEvent) => {
    const touchPoint = e.touches[0];
    const startPoint = touchGestureStartRef.current;
    if (!touchPoint || !startPoint) return;

    if (touchGestureDirectionRef.current === GestureDirection.NONE) {
      touchGestureDirectionRef.current = determineGestureDirection(startPoint, touchPoint);
    }

    // Stop plot interaction on vertical scrolling gestures
    if (touchGestureDirectionRef.current === GestureDirection.VERTICAL) {
      handlePointerLeave(e);
      return;
    }

    if (touchGestureDirectionRef.current === GestureDirection.HORIZONTAL) {
      if (e.cancelable) e.preventDefault(); // prevent scrolling during plot interaction
    }

    handlePointerInteraction(e);
  };

  const handlePointerLeave = (_: MouseEvent | TouchEvent) => {
    // Show the focused marker tooltip again when the mouse leaves the plot
    const focusedGuess = showFocusedMarkerTooltip.current ? tabStopGuessRef.current : null;
    setHoverTarget(focusedGuess && { type: DataPointType.PLAYER, item: focusedGuess });
  };

  const handleTouchEnd = (e: TouchEvent) => {
    touchGestureStartRef.current = null;
    touchGestureDirectionRef.current = GestureDirection.NONE;
    handlePointerLeave(e);
  };

  const handleMarkerFocus = (guess: PlayerTimeBonusPoint) => {
    tabStopGuessRef.current = guess;
    showFocusedMarkerTooltip.current = true;
    updateHoverTarget({ type: DataPointType.PLAYER, item: guess });
  };

  const handleMarkerBlur = (guess: PlayerTimeBonusPoint) => {
    if (tabStopGuessRef.current?.playerId === guess.playerId) {
      showFocusedMarkerTooltip.current = false;
    }
    // Only clear the tooltip if it still belongs to this marker
    setHoverTarget(prev =>
      prev?.type === DataPointType.PLAYER && prev.item.playerId === guess.playerId ? null : prev
    );
  };

  const revealPlot = () => {
    const plot = plotRef.current;
    if (!plot) return;

    // Wait a frame as to not interfere with the browser's focus-scrolling towards the marker
    requestAnimationFrame(() => {
      plot.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    });
  };

  return (
    <div
      ref={plotRef}
      class="time-bonus-plot-area"
      onMouseMove={handlePointerInteraction}
      onMouseLeave={handlePointerLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Zoom button in the top right corner of the plot */}
      {isZoomMeaningful && (
        <div
          className="zoom-lens-btn-wrapper"
          onMouseMove={e => e.stopPropagation()}
          onMouseEnter={e => {
            e.stopPropagation();
            setHoverTarget(null); // Clear the plot's hover state
          }}
          onTouchStart={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <WithTooltip text={isZoomed ? 'Reset zoom' : 'Zoom into players'}>
            <button
              type="button"
              class={`zoom-lens-btn ${isZoomed ? 'active' : ''}`}
              onClick={() => setIsZoomed(!isZoomed)}
            >
              <ZoomLens
                size={18}
                zoomIn={!isZoomed}
              />
            </button>
          </WithTooltip>
        </div>
      )}

      {/* The canvas we draw the time bonus curve and hover data on */}
      <div class="time-bonus-plot-canvas">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${plot.width} ${svgHeight}`}
          class="time-bonus-plot"
        >
          <defs>{plotDefinitions}</defs>

          {/* Layer an additional colour gradient on top of the curve segment before the first successful guess */}
          {fastestSuccessTime !== undefined && (
            <rect
              class="max-bonus-zone"
              x={0}
              y={0}
              width={timeToPlotX(fastestSuccessTime)}
              height={plot.height}
              fill="url(#max-bonus-zone-glow)"
            />
          )}

          {/* Axis line and time bonus graph */}
          <path
            d={`${svgCurvePath} L ${plot.width},${plot.height} L 0,${plot.height} Z`}
            fill="url(#curve-glow)"
          />
          <path
            d={svgCurvePath}
            class="curve-line"
          />
          <line
            x1={0}
            y1={plot.height}
            x2={plot.width}
            y2={plot.height}
            class="axis-line"
          />

          {/* Cursor hover indicator on graph */}
          {hoverTarget?.type === DataPointType.CURVE && hoverPlotPosition && (
            <g class="curve-hover-indicator">
              <line
                x1={hoverPlotPosition.x}
                y1={0}
                x2={hoverPlotPosition.x}
                y2={plot.height}
                class="curve-hover-line"
              />
              <circle
                cx={hoverPlotPosition.x}
                cy={hoverPlotPosition.y}
                r={markers.nodeRadius}
                class="curve-hover-node"
              />
            </g>
          )}

          {/* Markers for player guess times */}
          {playerGuessesInRenderingOrder.map((playerGuess, idx) => {
            const participant = findUser(participants, playerGuess.playerId);

            return (
              <PlayerMarker
                key={`${playerGuess.playerId}-${idx}`}
                plotX={timeToPlotX(playerGuess.time)}
                plotY={playerGuessToPlotY(playerGuess)}
                isIncorrect={playerGuess.multiplier === null}
                isHovered={playerGuess.playerId === hoveredPlayerId}
                isCurrentPlayer={playerGuess.playerId === currentPlayerId}
                markerColor={getMarkerColor(playerGuess)}
                avatarUrl={participant ? getAvatarUrl(participant) : null}
              />
            );
          })}
        </svg>

        {/* Invisible but tab-navigable markers at the player points */}
        <div
          class="plot-keyboard-layer"
          role="group"
          aria-label="Player guesses. Use the left and right arrow keys to move between players."
        >
          {visiblePlayerGuessesSortedByTime.map((playerGuess, index) => {
            const { elementRef, tabIndex, onFocus } = getTabProps(index);
            return (
              <div
                key={playerGuess.playerId}
                ref={elementRef}
                tabIndex={tabIndex}
                role="img"
                aria-label={getGuessLabel(playerGuess)}
                class="plot-keyboard-target"
                style={{
                  left: `${(timeToPlotX(playerGuess.time) / plot.width) * 100}%`,
                  top: `${(playerGuessToPlotY(playerGuess) / svgHeight) * 100}%`,
                }}
                onFocus={e => {
                  const isManualFocusAction =
                    e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null) ?? false;

                  onFocus();
                  handleMarkerFocus(playerGuess);

                  if (!isManualFocusAction) revealPlot();
                }}
                onBlur={() => handleMarkerBlur(playerGuess)}
                onKeyDown={e => {
                  // Dismiss the tooltip on Escape press
                  if (e.key === 'Escape' && hoverTarget !== null) {
                    e.stopPropagation();
                    showFocusedMarkerTooltip.current = false;
                    setHoverTarget(null);
                  } else {
                    handleKeyDown(e, index);
                  }
                }}
              />
            );
          })}
        </div>

        {/* Tooltip displaying some information about the currently hovered curve or player point */}
        {hoverTarget && hoverPlotPosition && (
          <PlotTooltip
            hoverTarget={hoverTarget}
            plotPosition={hoverPlotPosition}
            playerName={hoveredPlayerGuess ? getPlayerName(hoveredPlayerGuess) : null}
            accentColor={tooltipAccentColor}
          />
        )}
      </div>
    </div>
  );
};
