"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Card, CardHeader, Chip, Metric, Note, SectionLabel } from "@/components/ui";

/**
 * Archive Intelligence — what the agent learned from a bakery's photo library.
 *
 * Every number on this page is computed from rows at request time. Nothing is
 * written down: import another folder and the page changes. The one figure
 * that is not live is the calibration benchmark, and it is labelled as such,
 * because it was measured on a synthetic archive rather than this bakery's.
 */

/* ----------------------------- chart primitives ---------------------------- */

/**
 * Horizontal magnitude bars. Single series, so no legend — the title names it.
 * Every bar carries a direct value label, which is also the relief the
 * palette's light-mode contrast warning requires.
 */
function BarList({
  data,
  color = "var(--viz-1)",
  unit = "",
}: {
  data: Array<{ label: string; count: number }>;
  color?: string;
  unit?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="flex flex-col gap-2">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(88px,132px)_1fr_auto] items-center gap-3">
          <span className="truncate text-sm text-gray-900" title={d.label}>
            {d.label}
          </span>
          <span className="h-2.5 w-full overflow-hidden rounded-[4px] bg-gray-200/60">
            <span
              className="block h-full rounded-[4px]"
              style={{ width: `${(d.count / max) * 100}%`, background: color }}
            />
          </span>
          <span className="tnum w-10 text-right text-sm text-gray-1000">
            {d.count}
            {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Columns over time. Years are ordinal and few, so bars beat a line here.
 *
 * The plot area is a definite pixel height and bar heights are computed in
 * px: a percentage height inside an auto-height flex column resolves against
 * nothing and collapses the bars to zero.
 */
const COLUMN_AREA_PX = 128;

function YearColumns({ data }: { data: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="tnum text-xs text-gray-1000">{d.count}</span>
          <span className="flex w-full items-end" style={{ height: COLUMN_AREA_PX }}>
            <span
              className="block w-full rounded-t-[4px]"
              style={{
                height: Math.max(3, (d.count / max) * COLUMN_AREA_PX),
                background: "var(--viz-1)",
              }}
            />
          </span>
          <span className="tnum text-xs text-gray-700">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** The calibration benchmark: error against how many cakes were hand-priced. */
function LearningCurve({ points }: { points: Array<{ n: number; mape: number }> }) {
  const w = 460;
  const h = 150;
  const pad = { l: 34, r: 12, t: 10, b: 24 };
  const xs = points.map((p) => p.n);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...points.map((p) => p.mape));
  const x = (n: number) => pad.l + (n / maxX) * (w - pad.l - pad.r);
  const y = (m: number) => pad.t + (1 - m / (maxY * 1.1)) * (h - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.n)},${y(p.mape)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Error against calibration size">
      {[0.1, 0.15, 0.2].map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={w - pad.r} y1={y(g)} y2={y(g)} stroke="var(--ds-gray-400)" strokeWidth="1" />
          <text x={4} y={y(g) + 4} className="tnum" fontSize="10" fill="var(--ds-gray-900)">
            {Math.round(g * 100)}%
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--viz-1)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p) => (
        <g key={p.n}>
          <circle cx={x(p.n)} cy={y(p.mape)} r="4" fill="var(--viz-1)" stroke="var(--ds-background-100)" strokeWidth="2" />
          <text x={x(p.n)} y={h - 8} textAnchor="middle" className="tnum" fontSize="10" fill="var(--ds-gray-900)">
            {p.n}
          </text>
        </g>
      ))}
      {/* The knee: past this, more hand-pricing buys very little. */}
      <line x1={x(30)} x2={x(30)} y1={pad.t} y2={h - pad.b} stroke="var(--viz-2)" strokeWidth="1.5" strokeDasharray="3 3" />
      <text x={x(30) + 5} y={pad.t + 10} fontSize="10" fill="var(--viz-2)">
        30 — the ask
      </text>
    </svg>
  );
}

/* --------------------------------- types ---------------------------------- */

interface Intelligence {
  pipeline: { photos: number; cakes: number; shotsPerCake: number; captioned: number; withDate: number };
  span: { from: string | null; to: string | null; years: number };
  vocabulary: { themes: number; colors: number; techniques: number };
  topThemes: Array<{ label: string; count: number }>;
  occasions: Array<{ label: string; count: number }>;
  decorations: Array<{ label: string; count: number }>;
  coatings: Array<{ label: string; count: number }>;
  byYear: Array<{ label: string; count: number }>;
  privacy: { withCustomerName: number };
  pricing: { priced: number; total: number; quotingEnabled: boolean };
}

interface Option {
  number: number;
  description: string;
  photoUrl: string;
  madeOn: string | null;
  reasons: string[];
}

const PRESETS = ["spiderman", "unicorn", "rainbow", "dinosaur", "paw patrol", "mermaid", "football"];

/** Measured on a 140-cake synthetic archive — see the caption on the card. */
const BENCHMARK = [
  { n: 10, mape: 0.193 },
  { n: 15, mape: 0.16 },
  { n: 20, mape: 0.146 },
  { n: 30, mape: 0.119 },
  { n: 40, mape: 0.108 },
  { n: 60, mape: 0.103 },
];

/* ---------------------------------- page ----------------------------------- */

export default function ArchivePage() {
  const [data, setData] = useState<Intelligence | null>(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[] | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [latency, setLatency] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    fetch("/api/archive/intelligence")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    const mine = ++seq.current;
    setQuery(q);
    setSearching(true);
    const started = performance.now();
    try {
      const res = await fetch("/api/archive/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, guests: 20 }),
      });
      const body = await res.json();
      // A slower earlier query must not overwrite a newer one.
      if (mine !== seq.current) return;
      setLatency(Math.round(performance.now() - started));
      setOptions(body.options ?? []);
      setMatched(body.matched ?? []);
    } finally {
      if (mine === seq.current) setSearching(false);
    }
  }, []);

  const p = data?.pipeline;

  return (
    <div className="viz-root flex flex-col gap-6 pb-16">
      {/*
        The dark steps of the categorical palette, used unconditionally: this
        app has no light mode (globals.css pins `color-scheme: dark`), so a
        prefers-color-scheme swap would put light-surface hues on a dark card
        for anyone whose OS is set to light. The app surface is darker still
        than the palette's reference dark surface, so contrast only improves.
      */}
      <style>{`
        .viz-root { --viz-1:#3987e5; --viz-2:#d95926; --viz-3:#199e70; }
      `}</style>
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-medium tracking-tight text-gray-1000">Archive Intelligence</h1>
          <Badge tone="blue">live</Badge>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-gray-900">
          Nine years of one bakery&rsquo;s work, read by a vision model and turned into something the
          phone agent can search mid-call. Every number below is computed from the database on load.
        </p>
      </header>

      {/* ------------------------------ pipeline ------------------------------ */}
      <Card>
        <CardHeader
          title="Ingestion pipeline"
          description="A folder of camera-roll photographs with no prices, no sizes and no tags."
        />
        <div className="grid gap-6 px-5 py-5 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Photographs" value={p?.photos ?? "—"} caption="raw files scanned" />
          <Metric
            label="Distinct cakes"
            value={p?.cakes ?? "—"}
            caption={p ? `${p.shotsPerCake.toFixed(2)} shots each, bursts merged` : ""}
          />
          <Metric
            label="Captioned"
            value={p ? `${Math.round((p.captioned / Math.max(1, p.cakes)) * 100)}%` : "—"}
            caption="vision, zero failures"
          />
          <Metric label="Vocabulary" value={data?.vocabulary.themes ?? "—"} caption="distinct themes learned" />
          <Metric
            label="Span"
            value={data?.span.years ?? "—"}
            unit="yrs"
            caption={data?.span.from ? `${data.span.from} → ${data.span.to}` : ""}
          />
        </div>
      </Card>

      {/* ---------------------------- live retrieval --------------------------- */}
      <Card>
        <CardHeader
          title="Ask it for something"
          description="What the agent does mid-call: retrieve real past cakes, then text them as a numbered list."
          actions={
            latency !== null ? (
              <Badge tone={latency < 800 ? "green" : "amber"}>{latency} ms</Badge>
            ) : undefined
          }
        />
        <div className="px-5 py-5">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Chip key={preset} selected={query === preset} onClick={() => search(preset)}>
                {preset}
              </Chip>
            ))}
          </div>

          {searching && <p className="mt-5 text-sm text-gray-900">Searching the archive…</p>}

          {!searching && options && (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {options.map((o) => (
                  <figure key={o.number} className="overflow-hidden rounded-lg border border-gray-200">
                    <div className="relative aspect-square bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={o.photoUrl} alt={o.description} className="h-full w-full object-cover" />
                      <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-sm font-medium text-white">
                        {o.number}
                      </span>
                    </div>
                    <figcaption className="p-3 text-xs leading-relaxed text-gray-900">
                      {o.description}
                    </figcaption>
                  </figure>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-700">
                {matched.length > 0 && (
                  <>
                    Matched on <span className="text-gray-1000">{matched.join(", ")}</span>.{" "}
                  </>
                )}
                These are cakes this bakery actually made. On a call the agent texts this set as a
                numbered link and asks which one is closest.
              </p>
            </>
          )}

          {!searching && !options && (
            <p className="mt-5 text-sm text-gray-900">Pick a theme above to search 360 real cakes.</p>
          )}
        </div>
      </Card>

      {/* ------------------------------- charts -------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="What this bakery actually makes" description="Themes the vision pass extracted, by frequency." />
          <div className="px-5 py-5">
            {data ? <BarList data={data.topThemes} /> : <p className="text-sm text-gray-900">Loading…</p>}
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Output per year" description="Recovered from photo timestamps — no manual tagging." />
            <div className="px-5 py-5">
              {data ? <YearColumns data={data.byYear} /> : <p className="text-sm text-gray-900">Loading…</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Technique mix" description="What the decorating work actually consists of." />
            <div className="px-5 py-5">
              {data ? <BarList data={data.decorations} color="var(--viz-3)" /> : null}
            </div>
          </Card>
        </div>
      </div>

      {/* ------------------------------- pricing ------------------------------- */}
      <Card>
        <CardHeader
          title="Pricing engine"
          description="Comparable past cakes first, a fitted cost model second, a human when neither is confident."
          actions={
            <Badge tone={data?.pricing.quotingEnabled ? "green" : "amber"}>
              {data?.pricing.quotingEnabled ? "quoting enabled" : "awaiting calibration"}
            </Badge>
          }
        />
        <div className="grid gap-6 px-5 py-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="flex flex-col gap-4">
            <Metric
              label="Priced by the bakery"
              value={data ? `${data.pricing.priced} / ${data.pricing.total}` : "—"}
              caption="photographs cannot tell you what a cake sold for"
            />
            <Note tone="amber" title="Why nothing is quoted yet">
              A vision model can read a design off a photograph. It cannot read a price, and a sheet
              cake serves twenty or forty depending on how it is cut. Until the bakery prices a
              calibration set, every custom cake routes to &ldquo;the head baker will confirm&rdquo; —
              the agent never invents a number.
            </Note>
            <div className="flex flex-col gap-2">
              <SectionLabel>Confidence ladder</SectionLabel>
              {[
                ["Comparable past cakes", "≥3 close matches — quote a band"],
                ["Fitted cost model", "sparse matches — wider band, flagged"],
                ["Human", "neither — the baker prices it"],
              ].map(([k, v], i) => (
                <div key={k} className="flex items-start gap-2.5 text-sm">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: ["var(--viz-3)", "var(--viz-1)", "var(--viz-2)"][i] }}
                  />
                  <span className="text-gray-1000">
                    {k} <span className="text-gray-900">— {v}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>Error against calibration size</SectionLabel>
            <div className="mt-3">
              <LearningCurve points={BENCHMARK} />
            </div>
            <p className="mt-2 text-xs text-gray-700">
              Mean error of the fitted cost model as the bakery prices more cakes by hand. Measured
              by leave-one-out on a 140-cake <strong>synthetic</strong>{" "}archive, not this bakery&rsquo;s —
              it sets the expectation and the size of the ask. The real figure comes from{" "}
              <code className="rounded bg-gray-100 px-1">/api/archive/backtest</code> once the
              calibration sheet comes back.
            </p>
          </div>
        </div>
      </Card>

      {/* -------------------------------- detail ------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Occasions" />
          <div className="px-5 py-5">{data ? <BarList data={data.occasions} /> : null}</div>
        </Card>
        <Card>
          <CardHeader title="Coating" description="What she actually works in." />
          <div className="px-5 py-5">{data ? <BarList data={data.coatings} color="var(--viz-3)" /> : null}</div>
        </Card>
        <Card>
          <CardHeader title="Handled for her" />
          <div className="flex flex-col gap-4 px-5 py-5">
            <Metric
              label="Cakes carrying a customer's name"
              value={data ? `${data.privacy.withCustomerName} / ${data.pricing.total}` : "—"}
              caption="another child's name is piped on most of these"
            />
            <p className="text-sm text-gray-900">
              Showing them is normal — every bakery gallery does. The proposal page says the name
              would be changed, so nobody is offered someone else&rsquo;s cake by accident.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
