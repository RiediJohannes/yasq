import type { SVGAttributes } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import './YasqLogo.css';

/** Spring parameters: [angular frequency ω, damping ratio ζ]. ζ = 1 means no overshoot. */
type Spring = readonly [omega: number, zeta: number];

const REST_PATH = 'M 0 0 C 34.12 0 65.64 18.20 82.70 47.75'; // hanging, curved end
const STRAIGHT_PATH = 'M 0 0 C 33.33 0 66.67 0 100 0'; // taut, straight end

/* ---- JS-mode tuning (only used where CSS `d: path()` is unsupported, or with `forceJs`) ---- */
const PULL = 135; // rope travel in SVG units (keep equal to --pull in YasqLogo.css)
const LENGTH = 100; // length of the bendable loose end
const HANG_DEG = 60; // total bend of the loose end at rest
const PULL_IN: Spring = [9.5, 0.55];
const PULL_OUT: Spring = [8, 0.6];
const BEND_IN: Spring = [16, 1];
const BEND_OUT: Spring = [11, 0.7];

const supportsCssPath = (): boolean => typeof CSS !== 'undefined' && CSS.supports('d', 'path("M0 0")');

/** A circular arc of length LENGTH that turns by `deg`, written as one cubic Bézier. */
function endPath(deg: number): string {
  const f = (deg * Math.PI) / 180;
  if (Math.abs(f) < 1e-3) return STRAIGHT_PATH;
  const r = LENGTH / f;
  const h = (4 / 3) * Math.tan(f / 4) * r;
  const ex = r * Math.sin(f);
  const ey = r * (1 - Math.cos(f));
  const n = (v: number) => v.toFixed(2);
  return `M 0 0 C ${n(h)} 0 ${n(ex - h * Math.cos(f))} ${n(ey - h * Math.sin(f))} ${n(ex)} ${n(ey)}`;
}

export interface YasqLogoProps extends Omit<SVGAttributes<SVGSVGElement>, 'class' | 'className' | 'ref'> {
  className?: string;
  /** Force the JS fallback even where CSS `d: path()` works (handy for comparing both modes). */
  forceJs?: boolean;
}

export function YasqLogo({
  className = '',
  forceJs = false,
  'aria-label': label = 'YASQ logo',
  ...rest
}: YasqLogoProps) {
  const uid = useId(); // unique ids, so several logos can share one page
  const svgRef = useRef<SVGSVGElement>(null);
  const endRef = useRef<SVGPathElement>(null);
  const [jsMode, setJsMode] = useState(false); // server / first render = CSS-only mode

  useEffect(() => {
    if (forceJs || !supportsCssPath()) setJsMode(true);
  }, [forceJs]);

  useEffect(() => {
    const svg = svgRef.current;
    const end = endRef.current;
    if (!jsMode || !svg || !end) return undefined;

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let hovering = false;
    let p = 0,
      pv = 0; // rope progress and its velocity
    let bend = HANG_DEG,
      bendV = 0; // bend of the loose end (degrees) and its velocity
    let raf = 0;
    let last = 0;

    const pTarget = () => (hovering ? (calm ? 0.35 : 1) : 0);
    const bendTarget = () => (hovering ? 0 : HANG_DEG);

    const step = (dt: number): void => {
      const [w, z]: Spring = calm ? [8, 1] : hovering ? PULL_IN : PULL_OUT;
      pv += (-w * w * (p - pTarget()) - 2 * z * w * pv) * dt;
      p += pv * dt;
      const [wb, zb]: Spring = hovering ? BEND_IN : BEND_OUT;
      bendV += (-wb * wb * (bend - bendTarget()) - 2 * zb * wb * bendV) * dt;
      bend += bendV * dt;
    };

    const draw = (): void => {
      svg.style.setProperty('--p', p.toFixed(4));
      svg.style.setProperty('--pull', (p * PULL).toFixed(2));
      end.setAttribute('d', endPath(bend));
    };

    const frame = (now: number): void => {
      let dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      for (; dt > 0; dt -= 1 / 240) step(Math.min(dt, 1 / 240));

      const settled =
        Math.abs(p - pTarget()) < 5e-4 &&
        Math.abs(pv) < 5e-3 &&
        Math.abs(bend - bendTarget()) < 0.05 &&
        Math.abs(bendV) < 0.1;
      if (settled) {
        p = pTarget();
        pv = 0;
        bend = bendTarget();
        bendV = 0;
        draw();
        raf = 0;
        return;
      }
      draw();
      raf = requestAnimationFrame(frame);
    };

    const setHover = (value: boolean): void => {
      hovering = value;
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const onEnter = () => setHover(true);
    const onLeave = () => setHover(false);

    svg.addEventListener('pointerenter', onEnter);
    svg.addEventListener('pointerleave', onLeave);
    draw();

    return () => {
      svg.removeEventListener('pointerenter', onEnter);
      svg.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
      svg.style.removeProperty('--p');
      svg.style.removeProperty('--pull');
    };
  }, [jsMode]);

  const rope = `${uid}-rope`;
  const cut = `${uid}-cut`;

  return (
    <svg
      ref={svgRef}
      class={['yasq-logo', jsMode && 'is-js', className].filter(Boolean).join(' ')}
      viewBox="0 0 1152 630"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label}
      {...rest}
    >
      <defs>
        <path
          id={rope}
          d="M 998 720 L 998 520 C 998 480 1017.4 460 1055.6 436.2 A 137 137 0 0 0 983 183 A 137 137 0 0 0 854.3 366.9 A 137 137 0 0 0 983 457 L 1800 457"
        />
        <mask
          id={cut}
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
            href={`#${rope}`}
            class="seg halo band"
          />
          <use
            href={`#${rope}`}
            class="seg halo dot"
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

      <use
        href={`#${rope}`}
        class="seg arc"
        mask={`url(#${cut})`}
      />
      <g mask={`url(#${cut})`}>
        <path
          ref={endRef}
          class="end"
          d={REST_PATH}
        />
      </g>
      <use
        href={`#${rope}`}
        class="seg hook"
      />
      <use
        href={`#${rope}`}
        class="seg dot"
      />
    </svg>
  );
}
