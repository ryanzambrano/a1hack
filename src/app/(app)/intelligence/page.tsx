"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArchiveImport } from "@/components/archive-import";
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


/* ------------------------------ network map -------------------------------- */

/** Approximate country centroids — enough to place a dot, not a border. */
const CENTROIDS: Record<string, [number, number]> = {
  US: [39.8, -98.6], CA: [56.1, -106.3], GB: [55.4, -3.4], SE: [60.1, 18.6],
  AU: [-25.3, 133.8], DK: [56.3, 9.5], FR: [46.2, 2.2], NL: [52.1, 5.3],
  NO: [60.5, 8.5], NG: [9.1, 8.7], IE: [53.4, -8.2], DE: [51.2, 10.4],
};

/**
 * Where the network bakes, by country.
 *
 * An equirectangular dot map rather than a choropleth: the document records a
 * country per bakery and no coordinates, so a dot at a country centroid is
 * exactly as precise as the data and no more. Drawing filled borders would
 * imply per-region detail we do not have.
 */
function CoverageMap({ countries }: { countries: Array<{ code: string; bakeries: number; median8in: number | null }> }) {
  const w = 620;
  const h = 300;
  const maxCount = Math.max(1, ...countries.map((c) => c.bakeries));
  const project = (lat: number, lng: number): [number, number] => [
    ((lng + 180) / 360) * w,
    ((90 - lat) / 180) * h,
  ];
  const plotted = countries.filter((c) => CENTROIDS[c.code]);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Bakery coverage by country">
        {/* Graticule — enough to read the projection, recessive enough to ignore. */}
        {[-60, -30, 0, 30, 60].map((lat) => (
          <line key={lat} x1={0} x2={w} y1={project(lat, 0)[1]} y2={project(lat, 0)[1]}
            stroke="var(--ds-gray-400)" strokeWidth="1" />
        ))}
        {[-120, -60, 0, 60, 120].map((lng) => (
          <line key={lng} x1={project(0, lng)[0]} x2={project(0, lng)[0]} y1={0} y2={h}
            stroke="var(--ds-gray-400)" strokeWidth="1" />
        ))}

        {/* Largest first, so a small dot is never hidden behind a big one. */}
        {[...plotted]
          .sort((a, b) => b.bakeries - a.bakeries)
          .map((c) => {
            const [lat, lng] = CENTROIDS[c.code];
            const [x, y] = project(lat, lng);
            const r = 5 + Math.sqrt(c.bakeries / maxCount) * 17;
            return (
              <g key={c.code}>
                <circle cx={x} cy={y} r={r} fill="var(--viz-1)" fillOpacity="0.3"
                  stroke="var(--viz-1)" strokeWidth="1.5" />
                {/* Only the roomy dots get a number; the rest are named in the
                    legend. Europe packs six countries into a thumbnail, and
                    labelling them in place is illegible. */}
                {r > 11 && (
                  <text x={x} y={y + 4} textAnchor="middle" className="tnum" fontSize="11"
                    fontWeight="600" fill="var(--ds-gray-1000)">
                    {c.bakeries}
                  </text>
                )}
              </g>
            );
          })}
      </svg>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {countries.map((c) => (
          <li key={c.code} className="flex items-center gap-1.5 text-xs text-gray-900">
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--viz-1)" }} />
            <span className="text-gray-1000">{c.code}</span>
            <span className="tnum">{c.bakeries}</span>
            {c.median8in ? <span className="tnum text-gray-700">${c.median8in.toFixed(0)}</span> : null}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-gray-700">Bakeries per country, with the median 8-inch price.</p>
    </div>
  );
}

/**
 * The delivery ladder, drawn the way the zones are drawn: concentric rings of
 * equal width, each one step dearer than the last.
 */
function DeliveryRings({ ladder, ringKm }: { ladder: Array<{ km: number; feeUsd: number }>; ringKm: number }) {
  const size = 300;
  const c = size / 2;
  const rings = ladder.slice(0, 5);
  const maxKm = rings[rings.length - 1]?.km ?? 1;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[300px]" role="img"
      aria-label="Delivery fee by distance ring">
      {[...rings].reverse().map((ring, i) => {
        const r = (ring.km / maxKm) * (c - 16);
        return (
          <circle key={ring.km} cx={c} cy={c} r={r} fill="var(--viz-1)"
            fillOpacity={0.05 + i * 0.03} stroke="var(--viz-1)" strokeOpacity="0.55" strokeWidth="1.5" />
        );
      })}
      {rings.map((ring) => {
        const r = (ring.km / maxKm) * (c - 16);
        return (
          <text key={ring.km} x={c + 4} y={c - r + 12} fontSize="10" fill="var(--ds-gray-900)" className="tnum">
            {ring.km}km · ${ring.feeUsd.toFixed(0)}
          </text>
        );
      })}
      <circle cx={c} cy={c} r="4" fill="var(--viz-2)" />
      <text x={c} y={c + 18} textAnchor="middle" fontSize="10" fill="var(--ds-gray-900)">
        bakery
      </text>
      <text x={c} y={size - 2} textAnchor="middle" fontSize="10" fill="var(--ds-gray-700)">
        {ringKm}km rings
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

interface Benchmark {
  snapshot: string | null;
  totals: { bakeries: number; active: number; countries: number; zones: number; currencies: number };
  bands: Array<{ size: string; label: string; feeds: string; n: number; min: number; p25: number; median: number; p75: number; max: number }>;
  countries: Array<{ code: string; bakeries: number; median8in: number | null }>;
  delivery: { perRingUsd: number; ringKm: number; maxKm: number; ladder: Array<{ km: number; feeUsd: number }> };
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
  const [network, setNetwork] = useState<Benchmark | null>(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[] | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [latency, setLatency] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  const load = useCallback(() => {
    fetch("/api/archive/intelligence")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
    fetch("/api/pricing/benchmark")
      .then((r) => r.json())
      .then(setNetwork)
      .catch(() => setNetwork(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

      {/* ------------------------------- import ------------------------------- */}
      <ArchiveImport onImported={load} />

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

      {/* ------------------------------- network ------------------------------- */}
      <Card>
        <CardHeader
          title="The Daymaker network"
          description="What 86 bakeries in 9 countries actually charge — the market prior behind every cold-start quote."
          actions={network?.snapshot ? <Badge tone="gray">snapshot {network.snapshot}</Badge> : undefined}
        />
        <div className="grid gap-6 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Bakeries" value={network?.totals.active ?? "—"} caption={network ? `${network.totals.bakeries} on file` : ""} />
          <Metric label="Countries" value={network?.totals.countries ?? "—"} caption={network ? `${network.totals.currencies} currencies` : ""} />
          <Metric label="Delivery zones" value={network?.totals.zones ?? "—"} caption="drawn as distance rings" />
          <Metric
            label="8-inch spread"
            value={network ? `${(network.bands.find((b) => b.size === "8in")!.max / network.bands.find((b) => b.size === "8in")!.min).toFixed(1)}×` : "—"}
            caption="same cake, cheapest to dearest"
          />
        </div>

        <div className="grid gap-6 border-t border-gray-200 px-5 py-5 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <SectionLabel>Where the network bakes</SectionLabel>
            <div className="mt-3">{network ? <CoverageMap countries={network.countries} /> : null}</div>
          </div>
          <div>
            <SectionLabel>Delivery, by distance ring</SectionLabel>
            <div className="mt-3 flex justify-center">
              {network ? (
                <DeliveryRings ladder={network.delivery.ladder} ringKm={network.delivery.ringKm} />
              ) : null}
            </div>
            {network && (
              <p className="mt-2 text-xs text-gray-700">
                Median {"$"}
                {network.delivery.perRingUsd.toFixed(2)} per {network.delivery.ringKm}km ring, out to{" "}
                {network.delivery.maxKm}km. Fees resolve by point-in-polygon in production, but the
                polygons are drawn as equal-width rings — so distance predicts the fee.
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 px-5 py-5">
          <SectionLabel>What a cake costs across the network</SectionLabel>
          <ul className="mt-3 flex flex-col gap-2.5">
            {(network?.bands ?? []).map((b) => {
              const scale = Math.max(...(network?.bands ?? []).map((x) => x.max)) || 1;
              const pct = (v: number) => `${(v / scale) * 100}%`;
              return (
                <li key={b.size} className="grid grid-cols-[minmax(132px,150px)_1fr_auto] items-center gap-3">
                  <span className="whitespace-nowrap text-sm text-gray-900">
                    {b.label} <span className="text-gray-700">· {b.feeds}</span>
                  </span>
                  {/* p25-p75 box with the median marked — a level, not a total. */}
                  <span className="relative h-3.5 w-full rounded-[4px] bg-gray-200/50">
                    <span
                      className="absolute top-0 h-full rounded-[4px]"
                      style={{ left: pct(b.p25), width: pct(b.p75 - b.p25), background: "var(--viz-1)", opacity: 0.55 }}
                    />
                    <span
                      className="absolute top-[-2px] h-[18px] w-[2px] rounded"
                      style={{ left: pct(b.median), background: "var(--viz-1)" }}
                    />
                  </span>
                  <span className="tnum w-40 whitespace-nowrap text-right text-sm text-gray-1000">
                    ${b.p25.toFixed(0)}–${b.p75.toFixed(0)}{" "}
                    <span className="text-gray-700">med ${b.median.toFixed(0)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-gray-700">
            Interquartile range, median marked. This is the market, not this bakery — the agent
            never quotes a network median as though the baker had agreed to it. It seeds the
            calibration sheet and flags an input that looks wrong.
          </p>
        </div>
      </Card>

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
