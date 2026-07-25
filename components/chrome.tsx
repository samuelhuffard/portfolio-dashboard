/**
 * Private-wealth chrome primitives.
 *
 * The visual contract lives in `app/globals.css` (the `.pm-*` classes); these
 * components exist so screens compose the chrome instead of restating paddings
 * and rules. Nothing here fetches or formats data.
 */

import type { ReactNode } from "react";

/** The 1px-gap grid: main column beside the 340px rail, over a --rule ground. */
export function ScreenGrid({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div
      className="grid gap-px border-b"
      style={{
        gridTemplateColumns: "minmax(0,1fr) 340px",
        background: "var(--rule)",
        borderColor: "var(--rule)",
      }}
    >
      <section style={{ background: "var(--page)" }}>{main}</section>
      <aside className="pm-rail">{rail}</aside>
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pm-panel ${className}`}>{children}</div>;
}

/** Panel header row: plain-noun heading on the left, facts or controls right. */
export function PanelHead({
  title,
  caption,
  right,
}: {
  title: string;
  caption?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="pm-panel-head">
      <div className="flex items-baseline gap-3">
        <h2 className="pm-h2">{title}</h2>
        {caption ? <span className="pm-caption">{caption}</span> : null}
      </div>
      {right ?? null}
    </div>
  );
}

/** Equal-width divided metric row. No cards, no gaps. */
export function MetricStrip({ children, columns }: { children: ReactNode; columns: number }) {
  return (
    <div
      className="pm-panel grid border-b"
      style={{ gridTemplateColumns: `repeat(${columns},1fr)`, borderColor: "var(--rule)" }}
    >
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone,
  muted,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Gains and cautions only; everything else stays ink. */
  tone?: "pos" | "warn";
  /** Renders the figure as an unavailable em-dash. */
  muted?: boolean;
}) {
  const color = muted
    ? "var(--disabled)"
    : tone === "pos"
      ? "var(--pos)"
      : tone === "warn"
        ? "var(--warn)"
        : "var(--ink)";
  return (
    <div className="pm-metric">
      <div className="pm-metric-label">{label}</div>
      <div className="pm-figure" style={{ color }}>
        {value}
      </div>
      {sub ? (
        <div className="pm-metric-sub" style={muted ? { color: "#a3a5a0" } : undefined}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

export function RailBlock({
  title,
  right,
  grow,
  children,
}: {
  title: string;
  right?: ReactNode;
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`pm-rail-block${grow ? " pm-rail-grow" : ""}`}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="pm-h2">{title}</h2>
        {right ?? null}
      </div>
      {children}
    </div>
  );
}

/** Label left, mono value right. */
export function DefRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pm-defrow">
      <span>{label}</span>
      <span className="pm-num">{children}</span>
    </div>
  );
}

/** The rail's closing note: what the figures on this screen mean. */
export function Footnote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pm-footnote">
      <div className="pm-label mb-1.5">{label}</div>
      <p>{children}</p>
    </div>
  );
}

/**
 * Missing data is labelled, never filled. Used for a feed error, an empty
 * record, or a series that cannot be drawn yet.
 */
export function Hatch({ title, note }: { title: string; note?: string }) {
  return (
    <div className="pm-hatch">
      <div className="pm-hatch-title">{title}</div>
      {note ? <div className="pm-hatch-note">{note}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="pm-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className="pm-seg-item"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** An em-dash in --disabled. Never a zero, never "N/A". */
export function Nil() {
  return <span className="pm-nil">—</span>;
}

/** Coloured text, never a badge. */
export function Status({ tone, children }: { tone: "pos" | "warn" | "muted"; children: ReactNode }) {
  const color = tone === "pos" ? "var(--pos)" : tone === "warn" ? "var(--warn)" : "var(--muted)";
  return <span style={{ color }}>{children}</span>;
}

/** The 8px allocation bar: invested segment, cash segment, empty track. */
export function AllocationBar({ investedPct }: { investedPct: number | null }) {
  const invested = investedPct === null ? 0 : Math.max(0, Math.min(100, investedPct));
  return (
    <div className="mb-3 flex h-2" style={{ background: "var(--chip)" }}>
      <div style={{ width: `${invested}%`, background: "var(--accent)" }} />
      <div
        style={{
          width: `${100 - invested}%`,
          background: "var(--chip-2)",
          borderLeft: invested > 0 ? "1px solid #fff" : undefined,
        }}
      />
    </div>
  );
}
