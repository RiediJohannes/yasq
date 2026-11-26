/**
 * SHARED BY BOTH ANIMATION MODES — the single source of truth for every tunable value.
 *
 *   props ──resolveTuning()──▶ YasqLogoTuning ──toCssVariables()──▶ inline `--yasq-*` custom properties
 *                                   │                                   (read by YasqLogo.css, i.e. CSS mode,
 *                                   │                                    and by the letters/rope in JS mode too)
 *                                   └──────────────▶ useYasqJsAnimation.ts (JS mode reads the very same values)
 *
 * Nothing in here is specific to one mode. Mode-specific code lives in
 *   • YasqLogo.css            → "CSS-ONLY MODE" section
 *   • useYasqJsAnimation.ts   → everything in that file
 */

export type CubicBezier = readonly [x1: number, y1: number, x2: number, y2: number];

export interface SpringTiming {
  /** Seconds until the motion has settled (the spring has decayed to < 1 %). */
  duration: number;
  /** Damping ratio ζ in (0, 1]. 1 = no overshoot, 0.6 ≈ 10 % overshoot, 0.4 ≈ 25 %. */
  damping: number;
}

export interface LetterTuning {
  /** Y + beam: shift at progress 1, in logo units. */
  beamShiftX: number;
  beamShiftY: number;
  /** Y + beam: extra scale at progress 1 (0.16 = +16 %). */
  beamStretchX: number;
  beamStretchY: number;
  /** Y + beam: skew in degrees at progress 1. */
  beamSkewDeg: number;
  /** A: vertical squash (0.05 = −5 %) and downward shift in logo units. */
  aSquash: number;
  aSink: number;
  /** S: vertical squash and downward shift. */
  sSquash: number;
  sSink: number;
}

export interface GapTuning {
  /** Whitespace between the question-mark stem/hook and the rope passing underneath it. */
  underpass: number;
  /** Whitespace between the question-mark dot and the rope passing underneath it. */
  dotUnderpass: number;
  /** Width of the straight, parallel-edged cut in the ring (top left of the Q). */
  ringCut: number;
}

export interface LooseEndTuning {
  /** Length of the bendable end of the rope (the Q's dash), in logo units. */
  length: number;
  /** Total bend of the end while it hangs, in degrees. 0 = never droops. */
  hangAngle: number;
  /** Straightening when the rope is pulled taut. */
  straightenDuration: number;
  straightenEasing: CubicBezier;
  /** Drooping back down when the rope is released (a y2 > 1 gives a small sag). */
  droopDuration: number;
  droopEasing: CubicBezier;
}

export interface ReducedMotionTuning {
  /** Progress reached on hover when the user prefers reduced motion. */
  hoverProgress: number;
  /** Seconds for every transition in that case (the easing is plain `ease`). */
  duration: number;
}

export interface YasqLogoTuning {
  /** Progress while hovered. 1 = nominal; above 1 exaggerates rope travel and letter distortion. */
  hoverProgress: number;
  /** How far the rope travels per 1.0 of progress, in logo units. */
  ropePullDistance: number;
  /** Motion when the pointer enters. */
  pullTiming: SpringTiming;
  /** Motion when the pointer leaves. */
  releaseTiming: SpringTiming;
  letters: LetterTuning;
  gaps: GapTuning;
  looseEnd: LooseEndTuning;
  reducedMotion: ReducedMotionTuning;
}

/** Every group may be given partially; omitted values fall back to DEFAULT_TUNING. */
export type YasqLogoTuningInput = {
  [Key in keyof YasqLogoTuning]?: YasqLogoTuning[Key] extends object
    ? Partial<YasqLogoTuning[Key]>
    : YasqLogoTuning[Key];
};

export const DEFAULT_TUNING: YasqLogoTuning = {
  hoverProgress: 1.1,
  ropePullDistance: 145,
  pullTiming: { duration: 0.55, damping: 0.6 },
  releaseTiming: { duration: 1, damping: 0.4 },
  letters: {
    beamShiftX: 180,
    beamShiftY: 11,
    beamStretchX: 0.16,
    beamStretchY: 0.08,
    beamSkewDeg: -15,
    aSquash: 0.05,
    aSink: 2.7,
    sSquash: 0.04,
    sSink: 1.8,
  },
  gaps: { underpass: 19, dotUnderpass: 16, ringCut: 18 },
  looseEnd: {
    length: 100,
    hangAngle: 60,
    straightenDuration: 0.28,
    straightenEasing: [0.4, 0, 0.2, 1],
    droopDuration: 0.6,
    droopEasing: [0.3, 1.2, 0.5, 1],
  },
  reducedMotion: { hoverProgress: 0.35, duration: 0.2 },
};

/** CSS's built-in `ease` keyword, needed by the reduced-motion case in both modes. */
export const CSS_EASE: CubicBezier = [0.25, 0.1, 0.25, 1];

/** Like `{ ...defaults, ...overrides }`, but an explicit `undefined` never wins over a default. */
function withDefaults<T extends object>(defaults: T, overrides?: Partial<T>): T {
  const merged = { ...defaults };
  for (const key of Object.keys(overrides ?? {}) as Array<keyof T>) {
    const value = overrides?.[key];
    if (value !== undefined) merged[key] = value as T[keyof T];
  }
  return merged;
}

export function resolveTuning(input: YasqLogoTuningInput = {}): YasqLogoTuning {
  return {
    hoverProgress: input.hoverProgress ?? DEFAULT_TUNING.hoverProgress,
    ropePullDistance: input.ropePullDistance ?? DEFAULT_TUNING.ropePullDistance,
    pullTiming: withDefaults(DEFAULT_TUNING.pullTiming, input.pullTiming),
    releaseTiming: withDefaults(DEFAULT_TUNING.releaseTiming, input.releaseTiming),
    letters: withDefaults(DEFAULT_TUNING.letters, input.letters),
    gaps: withDefaults(DEFAULT_TUNING.gaps, input.gaps),
    looseEnd: withDefaults(DEFAULT_TUNING.looseEnd, input.looseEnd),
    reducedMotion: withDefaults(DEFAULT_TUNING.reducedMotion, input.reducedMotion),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Spring → easing table. CSS mode writes it into `linear(...)`; JS mode interpolates the same points.
 * ---------------------------------------------------------------------------------------------- */

/** ζ·ωₙ·duration. e^-4.8 ≈ 0.8 %, so the spring has settled when `duration` is over. */
const SETTLE_EXPONENT = 4.8;

/** Step response of a damped spring over normalised time 0…1, sampled at `samples + 1` equal steps. */
export function springEasingPoints(damping: number, samples = 40): number[] {
  const zeta = Math.min(Math.max(damping, 0.05), 1);
  const naturalFrequency = SETTLE_EXPONENT / zeta;
  const dampedFrequency = naturalFrequency * Math.sqrt(1 - zeta * zeta);
  const response = (time: number): number =>
    zeta >= 1
      ? 1 - Math.exp(-naturalFrequency * time) * (1 + naturalFrequency * time)
      : 1 -
        Math.exp(-zeta * naturalFrequency * time) *
          (Math.cos(dampedFrequency * time) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(dampedFrequency * time));
  return Array.from({ length: samples + 1 }, (_, index) =>
    index === 0 ? 0 : index === samples ? 1 : response(index / samples)
  );
}

const linearEasingCss = (points: readonly number[]): string =>
  `linear(${points.map(point => Number(point.toFixed(3))).join(', ')})`;

const cubicBezierCss = (easing: CubicBezier): string => `cubic-bezier(${easing.join(', ')})`;

/* ------------------------------------------------------------------------------------------------
 * Loose end of the rope (the Q's dash): one cubic Bézier, from (0,0) heading right.
 * CSS mode transitions between the hanging and the taut path; JS mode interpolates the same numbers.
 * ---------------------------------------------------------------------------------------------- */

/** [control1 x, control1 y, control2 x, control2 y, end x, end y] */
export type ControlPoints = readonly [number, number, number, number, number, number];

/** A circular arc of the given length that turns by `bendAngleDeg`, approximated by one cubic Bézier. */
export function looseEndControlPoints(length: number, bendAngleDeg: number): ControlPoints {
  const bendAngle = (bendAngleDeg * Math.PI) / 180;
  if (Math.abs(bendAngle) < 1e-3) return [length / 3, 0, (length * 2) / 3, 0, length, 0];
  const bendRadius = length / bendAngle;
  const handleLength = (4 / 3) * Math.tan(bendAngle / 4) * bendRadius;
  const endX = bendRadius * Math.sin(bendAngle);
  const endY = bendRadius * (1 - Math.cos(bendAngle));
  return [
    handleLength,
    0,
    endX - handleLength * Math.cos(bendAngle),
    endY - handleLength * Math.sin(bendAngle),
    endX,
    endY,
  ];
}

export const controlPointsToPath = (points: ControlPoints): string =>
  `M 0 0 C ${points.map(value => Number(value.toFixed(2))).join(' ')}`;

export const interpolateControlPoints = (from: ControlPoints, to: ControlPoints, amount: number): ControlPoints =>
  from.map((value, index) => value + ((to[index] ?? value) - value) * amount) as unknown as ControlPoints;

/* ------------------------------------------------------------------------------------------------
 * Tuning → CSS custom properties (inline style string on the <svg>)
 * ---------------------------------------------------------------------------------------------- */

export function toCssVariables(tuning: YasqLogoTuning): string {
  const { letters, gaps, looseEnd, reducedMotion } = tuning;
  const hangingPath = controlPointsToPath(looseEndControlPoints(looseEnd.length, looseEnd.hangAngle));
  const tautPath = controlPointsToPath(looseEndControlPoints(looseEnd.length, 0));

  const variables: Record<string, string | number> = {
    'hover-progress': tuning.hoverProgress,
    'pull-distance': tuning.ropePullDistance,
    'pull-duration': `${tuning.pullTiming.duration}s`,
    'pull-easing': linearEasingCss(springEasingPoints(tuning.pullTiming.damping)),
    'release-duration': `${tuning.releaseTiming.duration}s`,
    'release-easing': linearEasingCss(springEasingPoints(tuning.releaseTiming.damping)),
    'beam-shift-x': letters.beamShiftX,
    'beam-shift-y': letters.beamShiftY,
    'beam-stretch-x': letters.beamStretchX,
    'beam-stretch-y': letters.beamStretchY,
    'beam-skew': letters.beamSkewDeg,
    'a-squash': letters.aSquash,
    'a-sink': letters.aSink,
    's-squash': letters.sSquash,
    's-sink': letters.sSink,
    'rope-gap': gaps.underpass,
    'dot-gap': gaps.dotUnderpass,
    'ring-cut-gap': gaps.ringCut,
    'looseend-hanging-path': `path("${hangingPath}")`,
    'looseend-taut-path': `path("${tautPath}")`,
    'straighten-duration': `${looseEnd.straightenDuration}s`,
    'straighten-easing': cubicBezierCss(looseEnd.straightenEasing),
    'droop-duration': `${looseEnd.droopDuration}s`,
    'droop-easing': cubicBezierCss(looseEnd.droopEasing),
    'reduced-motion-progress': reducedMotion.hoverProgress,
    'reduced-motion-duration': `${reducedMotion.duration}s`,
  };

  return Object.entries(variables)
    .map(([name, value]) => `--yasq-${name}:${value}`)
    .join(';');
}
