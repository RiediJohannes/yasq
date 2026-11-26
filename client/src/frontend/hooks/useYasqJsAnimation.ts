/**
 * JS-ONLY ANIMATION MODE — nothing in this file runs when the CSS-only mode is active.
 *
 * It is a faithful re-implementation of the CSS transitions in YasqLogo.css, driven by the SAME
 * tuning values (durations, easing tables, targets, shapes), so tuning a prop changes both modes alike:
 *
 *   CSS mode                                          JS mode (this file)
 *   ───────────────────────────────────────────────   ──────────────────────────────────────────────
 *   transition: --yasq-progress <dur> linear(...)     progress   = AnimatedValue + linearEasing(table)
 *   transition: d <dur> cubic-bezier(...)             straightness = AnimatedValue + cubicBezierEasing
 *   :hover { --yasq-progress: hover-progress }        pointerenter → retarget(hover-progress)
 *   d: path(hanging) ⇄ path(taut)                     d = interpolateControlPoints(hanging, taut, straightness)
 *
 * Only two things are written to the DOM per frame:
 *   1. `--yasq-progress` on the <svg>  (letters, rope windows and the ring cut follow it through CSS)
 *   2. the `d` attribute of the loose end
 */
import type { RefObject } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';

import {
  controlPointsToPath,
  CSS_EASE,
  type CubicBezier,
  interpolateControlPoints,
  looseEndControlPoints,
  springEasingPoints,
  type YasqLogoTuning,
} from '../../utils/yasqLogoParams';

type Easing = (progress: number) => number;

/* ---------------------------------- easing (same maths as CSS) ---------------------------------- */

/** CSS `cubic-bezier(x1, y1, x2, y2)` */
export function cubicBezierEasing([x1, y1, x2, y2]: CubicBezier): Easing {
  const curve = (a: number, b: number, t: number) =>
    3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let low = 0;
    let high = 1;
    let t = x;
    for (let i = 0; i < 32; i++) {
      const error = curve(x1, x2, t) - x;
      if (Math.abs(error) < 1e-6) break;
      if (error > 0) high = t;
      else low = t;
      t = (low + high) / 2;
    }
    return curve(y1, y2, t);
  };
}

/** CSS `linear(p0, p1, …)` with equally spaced points */
export function linearEasing(points: readonly number[]): Easing {
  const last = points.length - 1;
  return x => {
    if (x <= 0) return points[0] ?? 0;
    if (x >= 1) return points[last] ?? 1;
    const position = x * last;
    const index = Math.floor(position);
    const from = points[index] ?? 0;
    const to = points[index + 1] ?? from;
    return from + (to - from) * (position - index);
  };
}

/* ---------------------- transitions (same semantics as CSS Transitions Level 1) ---------------------- */

interface Transition {
  from: number;
  to: number;
  /** Bookkeeping for the spec's "reversing shortening" when a transition is interrupted. */
  reversingAdjustedStart: number;
  reversingShorteningFactor: number;
  startTime: number; // ms
  duration: number; // ms
  easing: Easing;
}

export interface AnimatedValue {
  read: (now: number) => number;
  retarget: (target: number, durationSeconds: number, easing: Easing, now: number) => void;
  isRunning: () => boolean;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function createAnimatedValue(initial: number): AnimatedValue {
  let current = initial;
  let transition: Transition | null = null;

  const read = (now: number): number => {
    if (!transition) return current;
    const elapsed = (now - transition.startTime) / transition.duration;
    if (!(elapsed < 1)) {
      current = transition.to;
      transition = null;
      return current;
    }
    current = transition.from + (transition.to - transition.from) * transition.easing(Math.max(0, elapsed));
    return current;
  };

  const retarget = (target: number, durationSeconds: number, easing: Easing, now: number): void => {
    const value = read(now);
    const running = transition; // `read` already dropped a finished transition
    if (running?.to === target) return;
    if (value === target) {
      transition = null;
      return;
    }
    let reversingShorteningFactor = 1;
    let reversingAdjustedStart = value;
    if (running && running.reversingAdjustedStart === target) {
      // Interrupted and reversed: CSS shortens the new transition proportionally to how far the old one got.
      const oldProgress = clamp01((now - running.startTime) / running.duration);
      reversingShorteningFactor = clamp01(
        Math.abs(
          running.easing(oldProgress) * running.reversingShorteningFactor + (1 - running.reversingShorteningFactor)
        )
      );
      reversingAdjustedStart = running.to;
    }
    transition = {
      from: value,
      to: target,
      reversingAdjustedStart,
      reversingShorteningFactor,
      startTime: now,
      duration: durationSeconds * 1000 * reversingShorteningFactor,
      easing,
    };
  };

  return { read, retarget, isRunning: () => transition !== null };
}

/* ------------------------------------------------ hook ------------------------------------------------ */

interface UseYasqJsAnimationOptions {
  /** The hook does nothing unless this is true (i.e. the component chose JS mode). */
  enabled: boolean;
  svgRef: RefObject<SVGSVGElement | null>;
  looseEndRef: RefObject<SVGPathElement | null>;
  tuning: YasqLogoTuning;
}

export function useYasqJsAnimation({ enabled, svgRef, looseEndRef, tuning }: UseYasqJsAnimationOptions): void {
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;
  const redrawRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const looseEnd = looseEndRef.current;
    if (!enabled || !svg || !looseEnd) return undefined;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    /** 0 = rope released, ~1 = rope pulled (springs overshoot it). Mirrors CSS `--yasq-progress`. */
    const progress = createAnimatedValue(0);
    /** 0 = loose end hanging, 1 = loose end taut. Mirrors the CSS `d` transition between the two paths. */
    const straightness = createAnimatedValue(0);
    let frameRequest = 0;

    const draw = (progressNow: number, straightnessNow: number): void => {
      const { length, hangAngle } = tuningRef.current.looseEnd;
      const hanging = looseEndControlPoints(length, hangAngle);
      const taut = looseEndControlPoints(length, 0);
      svg.style.setProperty('--yasq-progress', progressNow.toFixed(4));
      looseEnd.setAttribute('d', controlPointsToPath(interpolateControlPoints(hanging, taut, straightnessNow)));
    };

    const redraw = (): void => {
      const now = performance.now();
      draw(progress.read(now), straightness.read(now));
    };

    const frame = (now: number): void => {
      draw(progress.read(now), straightness.read(now));
      frameRequest = progress.isRunning() || straightness.isRunning() ? requestAnimationFrame(frame) : 0;
    };

    const setHovering = (hovering: boolean): void => {
      const now = performance.now();
      const { hoverProgress, pullTiming, releaseTiming, looseEnd: end, reducedMotion } = tuningRef.current;
      const ease = cubicBezierEasing(CSS_EASE);

      if (prefersReducedMotion.matches) {
        progress.retarget(hovering ? reducedMotion.hoverProgress : 0, reducedMotion.duration, ease, now);
        straightness.retarget(hovering ? 1 : 0, reducedMotion.duration, ease, now);
      } else {
        const timing = hovering ? pullTiming : releaseTiming;
        progress.retarget(
          hovering ? hoverProgress : 0,
          timing.duration,
          linearEasing(springEasingPoints(timing.damping)),
          now
        );
        straightness.retarget(
          hovering ? 1 : 0,
          hovering ? end.straightenDuration : end.droopDuration,
          cubicBezierEasing(hovering ? end.straightenEasing : end.droopEasing),
          now
        );
      }
      if (!frameRequest) frameRequest = requestAnimationFrame(frame);
    };

    const onPointerEnter = () => setHovering(true);
    const onPointerLeave = () => setHovering(false);
    svg.addEventListener('pointerenter', onPointerEnter);
    svg.addEventListener('pointerleave', onPointerLeave);
    redrawRef.current = redraw;
    redraw();

    return () => {
      svg.removeEventListener('pointerenter', onPointerEnter);
      svg.removeEventListener('pointerleave', onPointerLeave);
      cancelAnimationFrame(frameRequest);
      redrawRef.current = null;
      svg.style.removeProperty('--yasq-progress');
    };
  }, [enabled, svgRef, looseEndRef]);

  // When props change, Preact rewrites the style/`d` it owns; put the animated values back before paint.
  useLayoutEffect(() => {
    redrawRef.current?.();
  }, [tuning]);
}
