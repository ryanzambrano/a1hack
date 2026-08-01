import Link from "next/link";

import { AdReel } from "@/components/ad-reel";
import {
  IconArrowRight,
  IconCheck,
  IconMark,
  IconMegaphone,
  IconPhone,
  IconPipeline,
  Wordmark,
} from "@/components/icons";
import { ButtonLink, Card, SectionLabel } from "@/components/ui";

/**
 * Headline variants. The promise is the order, not the machinery — Meta and
 * the voice agent are how it happens, and they belong in the subhead.
 * Swap which one ships by changing the index below.
 */
const HEADLINES = [
  {
    lead: "Get",
    accent: "qualified cake orders.",
    sub: "SweetLeads writes the ads, runs them on Meta and calls every lead that comes in — so what reaches you is a booked order, not a lead list.",
  },
  {
    lead: "Get more",
    accent: "cake orders.",
    sub: "Ads built from your own cake photos, and a voice agent that qualifies every lead within a minute of it landing.",
  },
  {
    lead: "More cake orders.",
    accent: "No phone calls.",
    sub: "SweetLeads runs the campaign, answers the leads and hands you a typed order — date, size, flavor, budget.",
  },
  {
    lead: "Wake up to",
    accent: "booked cake orders.",
    sub: "It advertises your cakes overnight and qualifies every lead on the phone, so the order book fills while the oven is off.",
  },
  {
    lead: "Bake the cakes.",
    accent: "We'll get the orders.",
    sub: "Ads from your own photos, a voice agent on every lead, and a structured order at the end of it.",
  },
] as const;

const HEADLINE = HEADLINES[0];

/** Under the buttons: the three things that have to be true for the promise. */
const PROMISES = [
  "Ads built from cake photos you already have",
  "Every lead called back within a minute",
  "Date, size, flavor and budget captured on the call",
];

const CAPABILITIES = [
  {
    icon: IconMegaphone,
    title: "Campaign generation",
    body: "Ad copy, creative and audience derived from your bakery profile, launched in one action.",
  },
  {
    icon: IconPhone,
    title: "Autonomous intake",
    body: "A voice agent dials every new lead within a minute and qualifies the order on the call.",
  },
  {
    icon: IconPipeline,
    title: "Structured orders",
    body: "Each call resolves to a typed order record — date, size, flavor, budget — not a note to yourself.",
  },
];

export default function Landing() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Wordmark className="text-[15px] text-gray-1000" />
          <Link
            href="/login"
            className="ml-auto rounded-md px-2 py-1 text-sm text-gray-900 transition-colors hover:text-gray-1000"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="relative flex-1">
        {/* Instrument-panel grid, faded out toward the bottom of the hero. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden">
          <div className="grid-bg absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          <div className="absolute left-[12%] top-[-20rem] size-[44rem] rounded-full bg-honey-glow/25 blur-[130px]" />
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid items-center gap-16 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-6">
              <SectionLabel>Bakery growth agent</SectionLabel>
              <h1 className="font-display mt-4 text-4xl font-semibold text-gray-1000 sm:text-5xl">
                {HEADLINE.lead}{" "}
                <span className="text-honey">{HEADLINE.accent}</span>
              </h1>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-gray-900">
                {HEADLINE.sub}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-2">
                <ButtonLink href="/login" variant="primary" size="lg" prefix={<IconArrowRight />}>
                  Get started
                </ButtonLink>
                <ButtonLink href="/login" size="lg">
                  Log in
                </ButtonLink>
              </div>

              <ul className="mt-8 space-y-2.5">
                {PROMISES.map((promise) => (
                  <li key={promise} className="flex items-start gap-2.5 text-sm text-gray-900">
                    <IconCheck className="mt-0.5 size-3.5 shrink-0 text-honey" />
                    {promise}
                  </li>
                ))}
              </ul>
            </div>

            {/* Held to a phone-ish width, and pushed right so the reel reads as
                a device beside the copy rather than a second column of it. */}
            <div className="lg:col-span-6 lg:pl-12">
              <div className="mx-auto max-w-[360px]">
                <AdReel />
              </div>
            </div>
          </div>

          <div className="mt-24 grid gap-3 sm:grid-cols-3">
            {CAPABILITIES.map(({ icon: Glyph, title, body }) => (
              <Card key={title} className="p-5">
                <Glyph className="text-gray-700" />
                <h2 className="mt-3 text-[15px] font-medium text-gray-1000">
                  {title}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-900">
                  {body}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-4 sm:px-6">
          <IconMark className="size-3 text-gray-500" />
          <span className="font-mono text-[11px] text-gray-700">
            SweetLeads — baked daily, booked automatically
          </span>
        </div>
      </footer>
    </div>
  );
}
