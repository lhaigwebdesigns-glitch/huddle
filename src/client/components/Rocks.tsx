/**
 * Cairn's illustration kit: rock people in the flat, grainy style, sparkles and arrows.
 * Render <RockDefs /> once per page (it holds the grain filter and the shared shapes).
 */

export const INK = "#0a100d";
export const MINT = "#a9fdac";
export const GREEN = "#44cf6c";
export const PERI = "#8fa6cb";
export const TEAL = "#5eb1bf";

/** The grain filter and shared symbols. Hidden; render once near the top of the page. */
export function RockDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <filter id="grain" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves={2} stitchTiles="stitch" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.04  0 0 0 0 0.06  0 0 0 0 0.05  0 0 0 -2.4 1.25" result="speck" />
          <feComposite in="speck" in2="SourceAlpha" operator="in" result="inside" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="9" result="soft" />
          <feComposite in="SourceAlpha" in2="soft" operator="arithmetic" k2={1} k3={-1} result="edge" />
          <feComposite in="inside" in2="edge" operator="in" result="edgeSpeck" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="edgeSpeck" />
          </feMerge>
        </filter>
        <symbol id="spark" viewBox="0 0 40 40">
          <path d="M20 0c1.4 11 4.6 16 20 20-15.4 4-18.6 9-20 20-1.4-11-4.6-16-20-20C15.4 16 18.6 11 20 0z" />
        </symbol>
        <symbol id="arrow-curve" viewBox="0 0 70 46">
          <path d="M4 8c18 30 40 34 58 22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M50 22l13 8-10 11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
      </defs>
    </svg>
  );
}

/** A four-point sparkle. */
export function Spark({ x = 0, y = 0, size = 40, fill = INK }: { x?: number; y?: number; size?: number; fill?: string }) {
  return <use href="#spark" x={x} y={y} width={size} height={size} fill={fill} />;
}

type Pose = "hold" | "wave" | "cheer" | "carry" | "sit";
type Prop = "book" | "laptop" | "pencil" | "bubble";

/**
 * A rock person drawn into a 100x100 box: stone body, legs and shoes, arms, a face, and an
 * optional prop. `x`/`y`/`s` place and scale it inside the box.
 */
export function RockPerson({
  body,
  ink = INK,
  pose = "wave",
  prop,
  x = 50,
  y = 0,
  s = 1,
}: {
  body: string;
  ink?: string;
  pose?: Pose;
  prop?: Prop;
  x?: number;
  y?: number;
  s?: number;
}) {
  const limb = body;
  const hand = body === MINT ? "#ffffff" : MINT;
  const edge = body === "#ffffff" ? { stroke: INK, strokeWidth: 2.4 } : body === INK ? { style: { stroke: "var(--rock-edge)", strokeWidth: 2.4 } } : {};
  const arm = (d: string, hx: number, hy: number) => (
    <>
      <path d={d} fill="none" stroke={limb} strokeWidth="6.5" strokeLinecap="round" />
      <circle cx={hx} cy={hy} r="4.4" fill={hand} />
    </>
  );
  const arms = {
    hold: [arm("M26 62c4 8 10 11 16 11", 42, 73), arm("M76 60c-3 8-9 12-16 13", 60, 73)],
    wave: [arm("M26 64c-6 6-8 12-7 18", 19, 82), arm("M76 56c8-6 11-14 10-24", 86, 32)],
    cheer: [arm("M27 58c-8-6-11-14-10-24", 17, 34), arm("M75 56c8-6 11-14 10-24", 85, 32)],
    carry: [arm("M26 64c-6 6-8 12-7 18", 19, 82), arm("M76 58c6-4 8-10 7-16", 83, 42)],
    sit: [arm("M26 64c-6 4-8 9-8 14", 18, 78), arm("M76 60c6-4 9-10 9-17", 85, 43)],
  }[pose];
  const props = {
    book: (
      <g transform="rotate(-8 51 72)">
        <rect x="34" y="67" width="34" height="17" rx="3" fill={MINT} stroke={INK} strokeWidth="2" />
        <path d="M51 67v17" stroke={INK} strokeWidth="2" />
      </g>
    ),
    laptop: (
      <>
        <rect x="33" y="62" width="34" height="18" rx="2.5" fill={INK} />
        <rect x="29" y="79" width="42" height="4" rx="2" fill={INK} />
        <circle cx="50" cy="71" r="2" fill={MINT} />
      </>
    ),
    pencil: (
      <g transform="rotate(-38 83 40)">
        <rect x="79" y="6" width="9" height="40" rx="2" fill={MINT} stroke={INK} strokeWidth="2" />
        <path d="M79 46l4.5 9 4.5-9z" fill={INK} />
      </g>
    ),
    bubble: (
      <>
        <path d="M62 8h30a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H76l-8 7v-7h-6a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6z" fill={INK} />
        <text x="77" y="27" textAnchor="middle" fontFamily="'Lexend Variable', sans-serif" fontWeight="800" fontSize="16" fill={MINT}>
          ?
        </text>
      </>
    ),
  };
  const front = prop === "book" || prop === "laptop";
  const legs =
    pose === "sit" ? (
      <>
        <path d="M40 80l-8 6M60 80l8 6" stroke={INK} strokeWidth="6.5" strokeLinecap="round" />
        <ellipse cx="28" cy="88" rx="7.5" ry="3.8" fill={INK} />
        <ellipse cx="72" cy="88" rx="7.5" ry="3.8" fill={INK} />
      </>
    ) : (
      <>
        <path d="M41 78l-3 14M59 78l3 14" stroke={INK} strokeWidth="6.5" strokeLinecap="round" />
        <ellipse cx="34" cy="94" rx="8" ry="4" fill={INK} />
        <ellipse cx="66" cy="94" rx="8" ry="4" fill={INK} />
      </>
    );
  return (
    <g transform={`translate(${x - 50 * s} ${y + (100 - 100 * s)}) scale(${s})`}>
      {legs}
      {prop && !front && props[prop]}
      <g filter="url(#grain)">
        <path d="M23 74c-7-14-1-32 16-37 17-5 36 1 40 17 4 15-4 27-21 29-15 2-29 1-35-9z" fill={body} {...edge} />
      </g>
      <circle cx="43" cy="53" r="2.7" fill={ink} />
      <circle cx="57" cy="52" r="2.7" fill={ink} />
      <path d="M45 60c3.4 2.6 7.6 2.6 10.4 0" fill="none" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
      {arms[0]}
      {arms[1]}
      {prop && front && props[prop]}
    </g>
  );
}

/** A rock face for small spots (avatars on the example work record). */
export function RockFace({ body, ink = INK, className }: { body: string; ink?: string; className?: string }) {
  return (
    <svg viewBox="0 0 54 54" className={className} aria-hidden="true">
      <g filter="url(#grain)">
        <path d="M6 40c-4-11 2-24 17-26 15-2 26 5 26 16s-8 16-21 16c-10 0-19-2-22-6z" fill={body} />
      </g>
      <circle cx="22" cy="31" r="2.3" fill={ink} />
      <circle cx="33" cy="30" r="2.3" fill={ink} />
      <path d="M24 37c3 2 6 2 8 0" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** One rock person as a standalone picture (for empty states and little moments in the app). */
export function RockArt({ className = "h-16 w-16", ...person }: Parameters<typeof RockPerson>[0] & { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" style={{ overflow: "visible" }}>
      <RockPerson {...person} />
    </svg>
  );
}
