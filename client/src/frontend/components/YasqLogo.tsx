/**
 * <YasqLogo> — animated YASQ logo.
 *
 * Two interchangeable animation modes, chosen automatically:
 *   • CSS-only  (YasqLogo.css, "CSS-ONLY MODE")  — CSS transitions + the CSS `d: path()` property.
 *   • JS        (useYasqJsAnimation.ts)          — fallback for browsers without `d: path()` / @property.
 * Both are driven by the same props: they are resolved once (yasqLogoParams.ts) and handed to the stylesheet
 * as `--yasq-*` custom properties; the JS mode reads the very same resolved values.
 */
import type { SVGAttributes } from 'preact';
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';

import './YasqLogo.css';
import {
  controlPointsToPath,
  looseEndControlPoints,
  resolveTuning,
  toCssVariables,
  type YasqLogoTuningInput,
} from '../../utils/yasqLogoParams';
import { useYasqJsAnimation } from '../hooks/useYasqJsAnimation';

export { DEFAULT_TUNING } from '../../utils/yasqLogoParams';
export type * from '../../utils/yasqLogoParams';

export interface YasqLogoProps
  extends Omit<SVGAttributes<SVGSVGElement>, 'class' | 'className' | 'ref' | 'style'>, YasqLogoTuningInput {
  className?: string;
  /** Force the JS animation mode even where the CSS-only mode works (handy for comparing both). */
  forceJs?: boolean;
}

/** The CSS-only mode needs animatable `d: path()` and registered custom properties (@property). */
const supportsCssOnlyMode = (): boolean =>
  typeof CSS !== 'undefined' && CSS.supports('d', 'path("M0 0")') && typeof CSS.registerProperty === 'function';

export function YasqLogo(props: YasqLogoProps) {
  const {
    className = '',
    forceJs = false,
    'aria-label': label = 'YASQ logo',
    // tuning parameters (see YasqLogoTuning for documentation and defaults)
    hoverProgress,
    ropePullDistance,
    pullTiming,
    releaseTiming,
    letters,
    gaps,
    looseEnd,
    reducedMotion,
    ...svgProps
  } = props;

  /* ---------------------------------- shared: params → CSS variables ---------------------------------- */
  const tuningInput: YasqLogoTuningInput = {
    hoverProgress,
    ropePullDistance,
    pullTiming,
    releaseTiming,
    letters,
    gaps,
    looseEnd,
    reducedMotion,
  };
  const tuningKey = JSON.stringify(tuningInput); // stable across re-renders with equal (inline) objects
  const tuning = useMemo(() => resolveTuning(tuningInput), [tuningKey]);
  const cssVariables = useMemo(() => toCssVariables(tuning), [tuning]);
  const restingLooseEndPath = controlPointsToPath(
    looseEndControlPoints(tuning.looseEnd.length, tuning.looseEnd.hangAngle)
  );

  const uid = useId();
  const ropeId = `${uid}-rope`;
  const ringCutMaskId = `${uid}-ring-cut`;
  const underpassMaskId = `${uid}-underpass`;
  const svgRef = useRef<SVGSVGElement>(null);
  const looseEndRef = useRef<SVGPathElement>(null);

  /* ------------------------------------------ mode selection ------------------------------------------ */
  const [jsMode, setJsMode] = useState(false); // server/first render = CSS-only mode
  useEffect(() => {
    setJsMode(forceJs || !supportsCssOnlyMode());
  }, [forceJs]);

  /* JS MODE ONLY: does nothing while `jsMode` is false. */
  useYasqJsAnimation({ enabled: jsMode, svgRef, looseEndRef, tuning });

  return (
    <svg
      ref={svgRef}
      class={['yasq-logo', jsMode && 'is-js', className].filter(Boolean).join(' ')}
      style={cssVariables}
      viewBox="0 0 1152 630"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label}
      {...svgProps}
    >
      <defs>
        {/* Rope centre-line: below the dot, up the stem, S-curve, once round the ring, then straight to the right. */}
        <path
          id={ropeId}
          d="M 998 720 L 998 520 C 998 480 1017.4 460 1055.6 436.2 A 137 137 0 0 0 983 183 A 137 137 0 0 0 854.3 366.9 A 137 137 0 0 0 983 457 L 1800 457"
        />

        {/* Straight, parallel-edged cut through the ring (it rotates with the rope, see CSS .ring-cut) */}
        <mask
          id={ringCutMaskId}
          maskUnits="userSpaceOnUse"
          x="-300"
          y="-300"
          width="2400"
          height="1400"
        >
          <rect
            x="-300"
            y="-300"
            width="2400"
            height="1400"
            fill="#fff"
          />
          <line
            class="ring-cut"
            x1="60"
            x2="200"
          />
        </mask>

        {/* Everything beneath the question-mark hook: ring cut + ONE continuous underpass band around dot and hook */}
        <mask
          id={underpassMaskId}
          maskUnits="userSpaceOnUse"
          x="-300"
          y="-300"
          width="2400"
          height="1400"
        >
          <rect
            x="-300"
            y="-300"
            width="2400"
            height="1400"
            fill="#fff"
          />
          <use
            href={`#${ropeId}`}
            class="seg halo band"
          />
          <use
            href={`#${ropeId}`}
            class="seg halo dot"
          />
          <line
            class="ring-cut"
            x1="60"
            x2="200"
          />
        </mask>
      </defs>

      <path
        class="letter y"
        d="M 1138,0 297,60 c -29,2 -41,16 -51,45 L 170,315 64,163 H 0 l 144,207 -20,62 c -16,-6 -38,-5 -59,4 -35,15 -52,46 -39,70 13,23 52,28 87,11 25,-13 39,-34 44,-59 L 265,162 c 8,-20 21,-27 45,-29 L 900,88 c 105,-8 185,22 238,72 z"
      />
      <path
        class="letter a"
        d="m 371,163 h 56 L 562,483 H 505 L 474,409 H 324 l -31,74 h -57 z m 28,66 -55,132 h 110 z"
      />
      <path
        class="letter s"
        d="m 786,189 -26,44 c -27,-20 -53,-30 -79,-30 -30,0 -48,13 -48,34 0,23 21,34 66,49 67,23 105,52 105,108 0,60 -48,96 -117,96 -49,0 -92,-19 -118,-44 l 29,-43 c 24,22 55,35 88,35 40,0 64,-17 64,-42 0,-26 -22,-41 -72,-58 -65,-22 -97,-51 -97,-102 0,-53 43,-79 101,-79 41,0 77,13 104,32 z"
      />

      {/* Q: C-arc and loose end underneath, hook and dot on top. The `d` attribute is the resting shape: it is what
          browsers show before JS mode takes over, and the CSS `d` property overrides it where supported. */}
      <use
        href={`#${ropeId}`}
        class="seg arc"
        mask={`url(#${underpassMaskId})`}
      />
      <g mask={`url(#${underpassMaskId})`}>
        <path
          ref={looseEndRef}
          class="end"
          d={restingLooseEndPath}
        />
      </g>
      <use
        href={`#${ropeId}`}
        class="seg hook"
        mask={`url(#${ringCutMaskId})`}
      />
      <use
        href={`#${ropeId}`}
        class="seg dot"
      />
    </svg>
  );
}
