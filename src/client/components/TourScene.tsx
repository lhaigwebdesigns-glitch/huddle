import { GREEN, INK, MINT, PERI, RockPerson, Spark, TEAL } from "./Rocks";

/**
 * Little animated pebble scenes for the welcome screens and tour cards. Drawn in code (inline
 * SVG + CSS loops in styles.css, `sc-*`), so they stay sharp, follow the theme and never go
 * stale when a screen changes. Reduced motion holds every scene still.
 */

export type SceneSpec =
  | { kind: "tap"; label: string; body?: string }
  | { kind: "hello"; name: string; body?: string }
  | { kind: "write" }
  | { kind: "tutor" }
  | { kind: "group" }
  | { kind: "receipt" }
  | { kind: "link" }
  | { kind: "grade" }
  | { kind: "tasks" }
  | { kind: "age" }
  | { kind: "code"; code?: string }
  | { kind: "teach" }
  | { kind: "student" };

/** A rock person placed at (x, y) in the scene, `size` px tall. */
function Rock({ x, y, size = 100, cls, ...p }: Parameters<typeof RockPerson>[0] & { x: number; y: number; size?: number; cls?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 100})`}>
      <g className={cls}>
        <RockPerson {...p} />
      </g>
    </g>
  );
}

const CARD = { fill: "var(--surface)", stroke: "var(--line-strong)", strokeWidth: 1.5 };
const LINE = { fill: "var(--fg)", opacity: 0.16 };
const LEX = "'Lexend Variable', 'Figtree Variable', sans-serif";

function Pill({ x, y, w, label, fill = GREEN, ledge = "#2a9a4b", cls }: { x: number; y: number; w: number; label: string; fill?: string; ledge?: string; cls?: string }) {
  return (
    <g className={cls}>
      <rect x={x} y={y + 4} width={w} height={30} rx={11} fill={ledge} />
      <g className="sc-press">
        <rect x={x} y={y} width={w} height={30} rx={11} fill={fill} />
        <text x={x + w / 2} y={y + 19.5} textAnchor="middle" fontFamily={LEX} fontWeight={700} fontSize={12.5} fill={INK}>
          {label.length > 18 ? `${label.slice(0, 17)}…` : label}
        </text>
      </g>
    </g>
  );
}

function scene(s: SceneSpec) {
  switch (s.kind) {
    case "tap":
      return (
        <>
          <Rock x={18} y={30} size={104} body={s.body ?? TEAL} pose="wave" cls="sc-bob" />
          <Pill x={122} y={56} w={100} label={s.label} />
          <g className="sc-burst">
            <Spark x={206} y={30} size={20} fill={MINT} />
            <Spark x={118} y={36} size={13} fill={PERI} />
          </g>
          <path d="M108 66c6-6 9-6 13-4" fill="none" stroke="var(--fg)" strokeWidth={2.5} strokeLinecap="round" opacity={0.5} />
        </>
      );
    case "hello":
      return (
        <>
          <Rock x={70} y={34} size={104} body={s.body ?? PERI} pose="wave" cls="sc-bob" />
          <g className="sc-pop-in">
            <rect x={60} y={10} width={124} height={34} rx={12} fill={MINT} stroke={INK} strokeWidth={2} />
            <text x={122} y={22} textAnchor="middle" fontFamily={LEX} fontWeight={700} fontSize={8} letterSpacing="0.12em" fill={INK}>
              HELLO, I'M
            </text>
            <text x={122} y={37} textAnchor="middle" fontFamily={LEX} fontWeight={800} fontSize={12.5} fill={INK}>
              {(s.name || "…").slice(0, 16)}
            </text>
          </g>
          <Spark x={196} y={60} size={18} fill={GREEN} />
          <Spark x={36} y={80} size={12} fill={TEAL} />
        </>
      );
    case "write":
      return (
        <>
          <rect x={118} y={18} width={104} height={110} rx={12} {...CARD} />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={130} y={34 + i * 14} width={i === 4 ? 46 : 80} height={6} rx={3} {...LINE} className="sc-line" style={{ animationDelay: `${i * 0.45}s` }} />
          ))}
          <g className="sc-pop-in" style={{ animationDelay: "2.3s" }}>
            <rect x={142} y={110} width={58} height={22} rx={11} fill={PERI} />
            <text x={171} y={125} textAnchor="middle" fontFamily={LEX} fontWeight={700} fontSize={10.5} fill={INK}>
              by you
            </text>
          </g>
          <Rock x={14} y={30} size={104} body={PERI} pose="carry" prop="pencil" cls="sc-scribble" />
        </>
      );
    case "tutor":
      return (
        <>
          <Rock x={12} y={34} size={100} body={PERI} pose="hold" prop="bubble" cls="sc-bob" />
          <Rock x={128} y={34} size={100} body={MINT} pose="hold" prop="book" cls="sc-bob sc-late" />
          <g>
            <rect x={150} y={8} width={64} height={28} rx={10} fill={INK} />
            <path d="M166 36l-2 8 9-8z" fill={INK} />
            {[0, 1, 2].map((i) => (
              <circle key={i} cx={170 + i * 12} cy={22} r={3.4} fill={MINT} className="sc-dot" style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </g>
          <Spark x={110} y={20} size={18} fill={GREEN} />
        </>
      );
    case "group":
      return (
        <>
          <Rock x={6} y={42} size={92} body={PERI} pose="cheer" cls="sc-hop" />
          <Rock x={74} y={34} size={100} body={TEAL} pose="cheer" cls="sc-hop sc-late" />
          <Rock x={150} y={42} size={92} body={MINT} pose="cheer" cls="sc-hop sc-later" />
          <g className="sc-burst">
            <Spark x={56} y={14} size={16} fill={GREEN} />
            <Spark x={170} y={10} size={20} fill={PERI} />
            <Spark x={118} y={4} size={12} fill={TEAL} />
          </g>
        </>
      );
    case "receipt":
      return (
        <>
          <rect x={98} y={16} width={126} height={116} rx={14} fill={MINT} stroke={INK} strokeWidth={2} />
          <text x={112} y={38} fontFamily={LEX} fontWeight={800} fontSize={12} fill={INK}>
            Who did what
          </text>
          {[
            [PERI, 78],
            [TEAL, 56],
            [GREEN, 34],
          ].map(([c, w], i) => (
            <g key={i}>
              <circle cx={118} cy={58 + i * 22} r={6.5} fill={c as string} stroke={INK} strokeWidth={1.5} />
              <rect x={132} y={54 + i * 22} width={w as number} height={8} rx={4} fill={INK} className="sc-bar" style={{ animationDelay: `${i * 0.25}s` }} />
            </g>
          ))}
          <Rock x={4} y={34} size={100} body={TEAL} pose="hold" prop="book" cls="sc-bob" />
        </>
      );
    case "link":
      return (
        <>
          <g className="sc-bob">
            <rect x={10} y={56} width={70} height={30} rx={15} fill={GREEN} />
            <path d="M33 71h10M30 66a5 5 0 0 0 0 10h4M46 66h4a5 5 0 0 1 0 10h-4" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
          </g>
          {[22, 71, 120].map((y, i) => (
            <g key={y}>
              <path d={`M84 71C110 71 112 ${y + 14} 138 ${y + 14}`} fill="none" stroke="var(--fg)" strokeWidth={2.2} strokeLinecap="round" strokeDasharray="4 6" opacity={0.55} className="sc-flow" />
              <rect x={144} y={y - 6} width={78} height={40} rx={12} {...CARD} />
              <Rock x={148} y={y - 14} size={46} body={[PERI, TEAL, MINT][i]} pose={i === 1 ? "cheer" : "wave"} cls={`sc-hop${i ? (i === 1 ? " sc-late" : " sc-later") : ""}`} />
              <rect x={194} y={y + 6} width={20} height={5} rx={2.5} {...LINE} />
              <rect x={194} y={y + 16} width={14} height={5} rx={2.5} {...LINE} />
            </g>
          ))}
        </>
      );
    case "grade":
      return (
        <>
          <rect x={104} y={16} width={118} height={84} rx={12} {...CARD} />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={118} y={32 + i * 13} width={i === 2 ? 40 : 66} height={6} rx={3} {...LINE} />
          ))}
          <path d="M176 66l10 10 20-24" fill="none" stroke={GREEN} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" className="sc-check" />
          <Pill x={120} y={108} w={96} label="Save & next" />
          <Rock x={6} y={34} size={100} body={TEAL} pose="carry" prop="pencil" cls="sc-bob" />
        </>
      );
    case "tasks":
      return (
        <>
          <rect x={104} y={18} width={118} height={108} rx={12} {...CARD} />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x={116} y={34 + i * 30} width={16} height={16} rx={5} fill="none" stroke="var(--fg)" strokeWidth={1.8} opacity={0.5} />
              <path d={`M119 ${42 + i * 30}l4 4 7-8`} fill="none" stroke={GREEN} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" className="sc-check" style={{ animationDelay: `${i * 0.6}s` }} />
              <rect x={140} y={39 + i * 30} width={[60, 46, 54][i]} height={6} rx={3} {...LINE} />
              <circle cx={210} cy={42 + i * 30} r={6} fill={[PERI, TEAL, MINT][i]} stroke={INK} strokeWidth={1.2} />
            </g>
          ))}
          <Rock x={6} y={34} size={100} body={PERI} pose="hold" prop="laptop" cls="sc-bob" />
        </>
      );
    case "age":
      return (
        <>
          <Rock x={66} y={36} size={104} body={PERI} pose="cheer" cls="sc-bob" />
          <g className="sc-pop-in">
            <circle cx={186} cy={42} r={26} fill={MINT} stroke={INK} strokeWidth={2} />
            <text x={186} y={49} textAnchor="middle" fontFamily={LEX} fontWeight={800} fontSize={19} fill={INK}>
              13+
            </text>
          </g>
          <Spark x={34} y={34} size={16} fill={TEAL} />
        </>
      );
    case "code":
      return (
        <>
          <rect x={98} y={58} width={124} height={40} rx={13} fill="var(--surface)" stroke="var(--line-strong)" strokeWidth={2} />
          <text x={160} y={84} textAnchor="middle" fontFamily={LEX} fontWeight={700} fontSize={17} letterSpacing="0.14em" fill="var(--fg)" className="sc-type">
            {(s.code || "ABC-123").slice(0, 7)}
          </text>
          <Rock x={6} y={34} size={100} body={PERI} pose="hold" prop="laptop" cls="sc-bob" />
          <Spark x={196} y={26} size={20} fill={GREEN} />
        </>
      );
    case "teach":
      return (
        <>
          <Rock x={64} y={30} size={108} body={TEAL} pose="hold" prop="book" cls="sc-bob" />
          <g className="sc-burst">
            <Spark x={40} y={26} size={18} fill={GREEN} />
            <Spark x={178} y={18} size={22} fill={PERI} />
            <Spark x={188} y={88} size={12} fill={MINT} />
          </g>
        </>
      );
    case "student":
      return (
        <>
          <Rock x={64} y={30} size={108} body={PERI} pose="carry" prop="pencil" cls="sc-bob" />
          <g className="sc-burst">
            <Spark x={36} y={32} size={20} fill={MINT} />
            <Spark x={184} y={24} size={16} fill={TEAL} />
            <Spark x={176} y={96} size={12} fill={GREEN} />
          </g>
        </>
      );
  }
}

export function TourScene({ spec, className }: { spec: SceneSpec; className?: string }) {
  return (
    <svg viewBox="0 0 240 140" className={className} aria-hidden="true" style={{ overflow: "visible" }}>
      {scene(spec)}
    </svg>
  );
}
