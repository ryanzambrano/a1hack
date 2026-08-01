"use client";

/**
 * The landing hero's proof: real cakes from the archive, being turned into
 * Meta ads, turning into booked orders.
 *
 * Everything here is a mock — it renders a fixed reel, not live campaign data.
 * The photographs are the real thing though (`public/archive`), which is the
 * point: the creative a bakery would actually run is the work it already did.
 */

import Image from "next/image";
import { useEffect, useState } from "react";

import { IconCheck } from "@/components/icons";
import { Card, CardFooter, Spinner, StatusDot } from "@/components/ui";

interface Ad {
  photo: string;
  /** Meta's "primary text" — the line above the creative. */
  primary: string;
  /** The bold line under the creative. */
  headline: string;
  audience: string;
  /** The order the ad produced, shown in the card that floats off the reel. */
  order: { who: string; detail: string; when: string; value: string };
}

const ADS: Ad[] = [
  {
    photo: "/archive/00e59d9b559c6a222e0c45aff48bf318.jpg",
    primary: "Their favourite show, on their birthday cake. Hand-piped, ready in 3 days.",
    headline: "Custom kids' birthday cakes",
    audience: "Parents 28–44 · 15 mi · $18/day",
    order: { who: "Danielle M.", detail: "2-tier, 30 servings", when: "Sat 14 Mar", value: "$285" },
  },
  {
    photo: "/archive/94e3621e374020d0b2e5eebb90b82392.jpg",
    primary: "Buttercream rosettes, piped by hand the morning of the party.",
    headline: "The cake everyone photographs",
    audience: "Parents 25–40 · 15 mi · $18/day",
    order: { who: "Priya R.", detail: "Rosette single, 24 servings", when: "Sun 22 Mar", value: "$190" },
  },
  {
    photo: "/archive/3baa2e4a422600290c1b99d2a82dbfbd.jpg",
    primary: "Shell by shell, sugar coral and all. Book your date before it goes.",
    headline: "Under-the-sea birthday cakes",
    audience: "Parents 28–44 · 15 mi · $22/day",
    order: { who: "Megan T.", detail: "Ocean tier, 40 servings", when: "Fri 27 Mar", value: "$340" },
  },
  {
    photo: "/archive/d1d3844fa1deb5ecd9a091339d20f708.jpg",
    primary: "Tropical buttercream, sugar hibiscus, a topper that survives the drive.",
    headline: "Character cakes, made to order",
    audience: "Parents 25–44 · 15 mi · $18/day",
    order: { who: "Alex P.", detail: "Themed single, 26 servings", when: "Sat 4 Apr", value: "$215" },
  },
  {
    photo: "/archive/5fd6e2abd9f352ca2fb5c84a6eca972c.jpg",
    primary: "Pastel swipes, gold sprinkles, her name across the front.",
    headline: "Princess cakes with her name on them",
    audience: "Parents 25–40 · 15 mi · $16/day",
    order: { who: "Sofia L.", detail: "Pastel single, 20 servings", when: "Sun 12 Apr", value: "$165" },
  },
  {
    photo: "/archive/bfdbfe6d33eb4926adf7a98e2e16cab8.jpg",
    primary: "Eight candles, one very good cat. Three days' notice is all we need.",
    headline: "Birthday cakes they'll recognise",
    audience: "Parents 28–44 · 15 mi · $18/day",
    order: { who: "Hannah K.", detail: "Character single, 18 servings", when: "Sat 18 Apr", value: "$155" },
  },
];

/** ~1s of visible work, then the finished ad sits still long enough to read. */
const GENERATING_MS = 950;
const READY_MS = 2900;

export function AdReel() {
  const [index, setIndex] = useState(0);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    // Static for anyone who asked the OS not to animate — the reel is
    // decoration, and the first ad tells the story on its own.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const toGenerating = setTimeout(() => setGenerating(true), READY_MS);
    const toNext = setTimeout(() => {
      setIndex((i) => (i + 1) % ADS.length);
      setGenerating(false);
    }, READY_MS + GENERATING_MS);

    return () => {
      clearTimeout(toGenerating);
      clearTimeout(toNext);
    };
  }, [index]);

  const ad = ADS[index];

  return (
    <div className="relative">
      <Card className="overflow-hidden shadow-medium">
        {/* Ads Manager chrome, so the preview reads as a real placement. */}
        <div className="flex items-center gap-2 border-b border-gray-200 bg-background/60 px-4 py-2.5">
          <StatusDot tone={generating ? "amber" : "green"} pulse />
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-gray-700">
            Meta Ads Manager
          </span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-gray-700">
            {generating ? (
              <>
                <Spinner className="size-3" />
                Generating creative
              </>
            ) : (
              <>
                <IconCheck className="size-3 text-green-900" />
                Ad {index + 1} of {ADS.length} live
              </>
            )}
          </span>
        </div>

        <div className="p-4">
          {/* The ad itself — Meta's stacked layout: account, primary text,
              creative, headline, CTA. */}
          <div className="rounded-lg border border-gray-200 bg-surface">
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-honey-dim font-display text-[13px] text-honey">
                E
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-gray-1000">Even Dough</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-gray-700">
                  Sponsored
                </p>
              </div>
            </div>

            <div className="px-3.5 pb-3.5">
              {/* Two lines either way, so the card doesn't grow and shrink as
                  copy of different lengths cycles through it. */}
              {generating ? (
                <div className="min-h-10">
                  <div className="shimmer h-3 w-4/5 rounded-sm" />
                  <div className="shimmer mt-2 h-3 w-3/5 rounded-sm" />
                </div>
              ) : (
                <p
                  key={`primary-${index}`}
                  className="animate-fade-up line-clamp-2 min-h-10 text-[13px] leading-relaxed text-gray-1000"
                >
                  {ad.primary}
                </p>
              )}

              {/* Every creative stays mounted so the swap is a crossfade rather
                  than a lazy fetch against an empty box. */}
              <div className="relative mt-3 aspect-square w-full overflow-hidden rounded-md bg-gray-100">
                {ADS.map((variant, i) => (
                  <Image
                    key={variant.photo}
                    src={variant.photo}
                    alt={i === index ? variant.headline : ""}
                    fill
                    priority={i === 0}
                    // The whole reel sits above the fold, so nothing here is
                    // worth deferring — a lazy creative shows an empty box on
                    // the swap that reveals it.
                    loading="eager"
                    sizes="(max-width: 1024px) 90vw, 400px"
                    className={
                      "object-cover transition-opacity duration-500 " +
                      (i === index ? "opacity-100" : "opacity-0")
                    }
                  />
                ))}
                {/* `.shimmer` sets its own `position: relative`, so it has to
                    be nested inside the positioned cover rather than be it. */}
                {generating && (
                  <div className="absolute inset-0">
                    <div className="shimmer size-full" />
                  </div>
                )}
              </div>

              {generating ? (
                <div className="mt-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="shimmer h-3 w-2/3 rounded-sm" />
                    <div className="shimmer mt-1.5 h-2.5 w-1/2 rounded-sm" />
                  </div>
                  <div className="shimmer h-6 w-20 rounded-md" />
                </div>
              ) : (
                <div key={`headline-${index}`} className="animate-fade-up mt-3 flex items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-gray-1000">
                      {ad.headline}
                    </p>
                    <p className="font-mono text-[10px] text-gray-700">{ad.audience}</p>
                  </div>
                  <span className="ml-auto shrink-0 rounded-md bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-1000 shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-300)]">
                    Order now
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* The rest of the archive, queued up as the next creatives. */}
          <div className="mt-4 flex items-center justify-between gap-2">
            {ADS.map((variant, i) => (
              <span
                key={variant.photo}
                className={
                  "relative size-9 shrink-0 overflow-hidden rounded-md bg-gray-100 transition-opacity " +
                  (i === index
                    ? "opacity-100 shadow-[0_0_0_2px_var(--ds-honey)]"
                    : "opacity-45 shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-300)]")
                }
              >
                <Image
                  src={variant.photo}
                  alt=""
                  fill
                  sizes="36px"
                  className="object-cover"
                />
              </span>
            ))}
          </div>
        </div>

        {/* What the ad above actually produced. The whole pitch is this strip:
            the creative at the top ends as a typed order down here. */}
        <CardFooter className="flex-nowrap items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusDot tone="green" pulse />
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-gray-900">
                Order booked
              </span>
            </div>
            <p
              key={`order-${index}`}
              className="animate-fade-up mt-1.5 truncate text-[13px] font-medium text-gray-1000"
            >
              {ad.order.who} · {ad.order.detail}
            </p>
          </div>
          <div className="ml-auto shrink-0 text-right">
            <p className="tnum text-[13px] font-medium text-gray-1000">{ad.order.value}</p>
            <p className="tnum font-mono text-[10px] text-gray-700">{ad.order.when}</p>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
