import { useMemo, useRef, useState } from 'preact/hooks';
import {
  getAvatarUrl,
  getDisplayName,
  MAX_TIME_MULTIPLIER,
  MIN_TIME_MULTIPLIER,
  Participant,
  PlayerTimeBonusPoint,
  TimeBonusSummary
} from "@yasq/shared";

enum DataPointType {
  CURVE = 'curve',
  PLAYER = 'player',
}

type BaseHoverData = {
  plotX: number;
  plotY: number;
  tooltipLeft: number;
  tooltipTop: number;
};

type CurveHoverData = BaseHoverData & {
  type: DataPointType.CURVE;
  time: number;
  multiplier: number;
};

type PlayerHoverData = BaseHoverData & {
  type: DataPointType.PLAYER;
  player: PlayerTimeBonusPoint;
  title: string;
};

type HoverData = CurveHoverData | PlayerHoverData;


interface PlotProps {
  currentPlayer: Participant | null;
  participants: Map<string, Participant>
  data: TimeBonusSummary | null;
}

export const TimeBonusPlot = ({ currentPlayer, participants, data }: PlotProps) => {
  if (data == null) {
    return;
  }

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverData, setHoverData] = useState<HoverData | null>(null);

  const plotWidth = 600;
  const plotHeight = 250;
  const xAxisHeight = plotHeight;
  const avatarRowHeight = 50;
  const svgHeight = plotHeight + avatarRowHeight;

  const MIN_MULT = MIN_TIME_MULTIPLIER;
  const MAX_MULT = MAX_TIME_MULTIPLIER;

  const { totalTime, curvePoints, playerGuessTimes } = data;

  // Functions to map time/multiplier to SVG coordinates
  const getX = (time: number) => (time / totalTime) * plotWidth;
  const getY = (mult: number) => plotHeight - ((mult - MIN_MULT) / (MAX_MULT - MIN_MULT) * plotHeight);

  // Compute the SVG path for the decaying time bonus curve
  const svgCurvePath = useMemo(() => {
    if (!curvePoints.length) return '';
    const strings = curvePoints.map(pt =>
      `${getX(pt.time).toFixed(1)},${getY(pt.multiplier).toFixed(1)}`);
    return `M ${strings.join(' L ')}`;
  }, [curvePoints, totalTime]);

  // Determine the colour theme for a player marker
  const getMarkerColor = (p: PlayerTimeBonusPoint) => {
    if (p.playerId === currentPlayer?.id) return 'var(--color-marker-current)';
    if (p.multiplier === null) return 'var(--color-marker-incorrect)';
    if (p.fullyCorrect) return 'var(--color-marker-correct)';
    return 'var(--color-marker-partial)';
  };

  const tooltipBorderColor = hoverData
    ? hoverData.type === DataPointType.PLAYER
      ? getMarkerColor(hoverData.player)
      : 'var(--color-curve)'
    : 'var(--color-plot-tooltip-border)';

  // Identify the first player with a successful or partially correct guess
  const firstSuccessInfo = useMemo(() => {
    const validGuesses = playerGuessTimes.filter(p => p.multiplier !== null);
    if (validGuesses.length === 0) return null;

    const earliest = validGuesses.reduce((prev, curr) => (curr.time < prev.time ? curr : prev));
    return {
      playerId: earliest.playerId,
      time: earliest.time,
      x: getX(earliest.time),
    };
  }, [playerGuessTimes, totalTime, plotWidth]);

  // Sort the player guess to affect SVG render order (last element is drawn on top)
  const sortedPlayerGuessTimes = useMemo(() => {
    if (!hoverData || hoverData.type !== DataPointType.PLAYER) {
      return playerGuessTimes.sort((a, b) => {
        // Always put the current player on top when no player marker is hovered)
        if (a.playerId === currentPlayer?.id) return 1;
        if (b.playerId === currentPlayer?.id) return -1;
        // For all the other players, prioritize faster players
        return b.time - a.time;
      });
    }

    const hoveredId = hoverData.player.playerId;
    return [...playerGuessTimes].sort((a, b) => {
      // First, prioritize hovered player
      if (a.playerId === hoveredId) return 1;
      if (b.playerId === hoveredId) return -1;
      // Next, prioritize current player
      if (a.playerId === currentPlayer?.id) return 1;
      if (b.playerId === currentPlayer?.id) return -1;
      // Lastly, prioritize faster players
      return b.time - a.time;
    });
  }, [playerGuessTimes, hoverData]);

  const getClientX = (e: MouseEvent | TouchEvent): number | null => {
    if ('touches' in e) {
      if (e.touches && e.touches.length > 0) {
        return e.touches[0].clientX;
      }
      return null;
    }
    return e.clientX;
  };

  const handlePointerInteraction = (e: MouseEvent | TouchEvent) => {
    if (!svgRef.current || !containerRef.current || !curvePoints.length) return;

    const pointerX = getClientX(e);
    if (pointerX === null) return;

    const plotAreaRef = containerRef.current.getBoundingClientRect();
    const svgRect = svgRef.current.getBoundingClientRect();
    const relativeX = pointerX - svgRect.left;
    const svgX = Math.max(0, Math.min(plotWidth, (relativeX / svgRect.width) * plotWidth));

    let closestCurvePoint: HoverData | null = null;
    let minCurveDist = Infinity;
    let closestPlayerPoint: HoverData | null = null;
    let minPlayerDist = Infinity;

    const toTooltipCoordinates = (plotX: number, plotY: number) => ({
      left: svgRect.left - plotAreaRef.left + (plotX / plotWidth) * svgRect.width,
      top: svgRect.top - plotAreaRef.top + (plotY / svgHeight) * svgRect.height - 10,
    });

    // Find the closest data point of the time bonus curve
    curvePoints.forEach(pt => {
      const plotX = getX(pt.time);
      const dist = Math.abs(plotX - svgX);
      if (dist < minCurveDist) {
        minCurveDist = dist;
        const plotY = getY(pt.multiplier);
        const tooltipCoordinates = toTooltipCoordinates(plotX, plotY);

        closestCurvePoint = {
          type: DataPointType.CURVE,
          time: pt.time / 1000.0,
          multiplier: pt.multiplier,
          plotX,
          plotY,
          tooltipLeft: tooltipCoordinates.left,
          tooltipTop: tooltipCoordinates.top
        };
      }
    });

    // Find the closest data point of a player's guess
    sortedPlayerGuessTimes.forEach(pt => {
      const plotX = getX(pt.time);
      const dist = Math.abs(plotX - svgX);
      if (dist < minPlayerDist) {
        minPlayerDist = dist;
        const plotY = pt.multiplier === null ? xAxisHeight : getY(pt.multiplier);
        const tooltipCoordinates = toTooltipCoordinates(plotX, plotY);

        const playerDataPoint: PlayerTimeBonusPoint = {
          playerId: pt.playerId,
          time: pt.time / 1000.0,
          multiplier: pt.multiplier,
          fullyCorrect: pt.fullyCorrect,
        };

        const player = participants.get(pt.playerId) ?? null;
        const playerName = pt.playerId === currentPlayer?.id
          ? "You"
          : player !== null
            ? getDisplayName(player)
            : "Unknown Player";

        closestPlayerPoint = {
          type: DataPointType.PLAYER,
          player: playerDataPoint,
          title: playerName,
          plotX,
          plotY,
          tooltipLeft: tooltipCoordinates.left,
          tooltipTop: tooltipCoordinates.top
        };
      }
    });

    const PLAYER_SNAP_DISTANCE = 16;
    if (closestPlayerPoint && minPlayerDist <= PLAYER_SNAP_DISTANCE) {
      setHoverData(closestPlayerPoint);
    } else {
      setHoverData(closestCurvePoint);
    }
  };

  const handlePointerLeave = (_: MouseEvent | TouchEvent) => {
    setHoverData(null);
  };

  return (
    <div
      ref={containerRef}
      class="time-bonus-plot-area"
      onMouseMove={handlePointerInteraction}
      onMouseLeave={handlePointerLeave}
      onTouchStart={handlePointerInteraction}
      onTouchMove={handlePointerInteraction}
      onTouchEnd={handlePointerLeave}
      onTouchCancel={handlePointerLeave}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${plotWidth} ${svgHeight}`}
        class="time-bonus-plot"
      >
        <defs>
          <linearGradient id="curve-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--color-curve)" stop-opacity="0.25" />
            <stop offset="100%" stop-color="var(--color-curve)" stop-opacity="0" />
          </linearGradient>
          {/* Additional gradient for the curve segment before the first successful guess */}
          <linearGradient id="max-bonus-zone-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--color-curve-start, #22c55e)" stop-opacity="0.12" />
            <stop offset="100%" stop-color="var(--color-curve-start, #22c55e)" stop-opacity="0.01" />
          </linearGradient>
          {/* Clipping mask to turn avatar into round images */}
          <clipPath id="avatar-clip" clipPathUnits="objectBoundingBox">
            <circle cx="0.5" cy="0.5" r="0.5" />
          </clipPath>
        </defs>

        {/* Layer an additional color gradient on top of the curve segment before the first successful guess */}
        {firstSuccessInfo !== null && (
          <rect
            class="max-bonus-zone"
            x={0}
            y={0}
            width={firstSuccessInfo.x}
            height={xAxisHeight}
            fill="url(#max-bonus-zone-glow)"
          />
        )}

        {/* Axis line and time bonus graph */}
        <path d={`${svgCurvePath} L ${plotWidth},${xAxisHeight} L 0,${xAxisHeight} Z`} fill="url(#curve-glow)" />
        <path d={svgCurvePath} class="curve-line" />
        <line x1={0} y1={xAxisHeight} x2={plotWidth} y2={xAxisHeight} class="axis-line" />

        {/* Cursor hover indicator on graph */}
        {hoverData?.type === DataPointType.CURVE && (
          <g class="curve-hover-indicator">
            <line x1={hoverData.plotX} y1={0} x2={hoverData.plotX} y2={xAxisHeight} class="curve-hover-line" />
            <circle cx={hoverData.plotX} cy={hoverData.plotY} r="5" class="curve-hover-node" />
          </g>
        )}

        {/* Markers for player guess times */}
        {sortedPlayerGuessTimes.map((p, idx) => {
          const playerX = getX(p.time);
          const isIncorrect = p.multiplier === null;
          const playerY = isIncorrect ? xAxisHeight : getY(p.multiplier!);
          const participant = participants.get(p.playerId)
          const isHovered = hoverData?.type === DataPointType.PLAYER && hoverData.player.playerId === p.playerId;
          const isCurrentPlayer = p.playerId === currentPlayer?.id;

          const avatarRadius = 18;
          const avatarTopOffset = 12;
          const ringCenterY = xAxisHeight + avatarTopOffset + avatarRadius;

          return (
            <g
              key={`${p.playerId}-${idx}`}
              class={`player-marker ${isHovered ? 'is-hovered' : ''} ${isCurrentPlayer ? 'current' : ''}`}
              style={{'--marker-color': getMarkerColor(p)}}
            >
              <line x1={playerX} y1={playerY} x2={playerX} y2={xAxisHeight + 20} class="player-line" />

              {/* Small marker on the curve at the awarded multiplier */}
              {isIncorrect ? (
                <g class="player-node-x" transform={`translate(${playerX}, ${xAxisHeight})`}>
                  <line x1="-4" y1="-4" x2="4" y2="4" />
                  <line x1="-4" y1="4" x2="4" y2="-4" />
                </g>
              ) : (
                <circle cx={playerX} cy={playerY} r="5" class="player-node" />
              )}

              {/* Player avatar at the bottom of the plot */}
              <g class="player-avatar-bundle">
                {participant && (
                  <image
                    href={getAvatarUrl(participant)}
                    x={playerX - avatarRadius}
                    y={xAxisHeight + avatarTopOffset}
                    width={2 * avatarRadius}
                    height={2 * avatarRadius}
                    class="player-avatar"
                    clip-path="url(#avatar-clip)"
                  />
                )}
                <circle cx={playerX} cy={ringCenterY} r={avatarRadius} class="player-avatar-ring" />
              </g>

              {/* Tiny chevron to highlight the position of the current player */}
              {isCurrentPlayer && (
                <g transform={`translate(${playerX}, ${playerY - 14})`}>
                  <path class="player-chevron" d="M -4.5,-10 L 4.5,-10 L 0,0 Z" />
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {hoverData && (
        <div
          class="plot-tooltip"
          style={{
            left: `${hoverData.tooltipLeft}px`,
            top: `${hoverData.tooltipTop}px`,
            borderColor: tooltipBorderColor,
          }}
        >
          {hoverData.type === DataPointType.PLAYER ? (
            <>
              <span class="tooltip-title" style={{ color: getMarkerColor(hoverData.player) }}>
                {hoverData.title}
              </span>
              <span class="tooltip-multiplier" style={{ color: getMarkerColor(hoverData.player) }}>
                {hoverData.player.multiplier !== null
                  ? `${(100 * hoverData.player.multiplier).toFixed(1)}%`
                  : 'Incorrect'
                }
              </span>
              <span class="tooltip-time">Time: {hoverData.player.time.toFixed(1)}s</span>
            </>
          ) : (
            <>
              <span class="tooltip-multiplier" style={{ color: 'var(--color-curve)' }}>
                {(100 * hoverData.multiplier).toFixed(1)}%
              </span>
              <span class="tooltip-time">Time: {hoverData.time.toFixed(1)}s</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};