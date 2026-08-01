"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { IconArrowRight, IconMark, IconRefresh } from "@/components/icons";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  DataRow,
  EmptyState,
  Metric,
  SectionLabel,
} from "@/components/ui";
import { useApp } from "@/lib/store";

export default function CampaignPage() {
  const { bakery, campaign, hydrated, busy, launchCampaign, generateCampaign } =
    useApp();
  const router = useRouter();
  const [launching, setLaunching] = useState(false);

  if (!hydrated) return null;

  if (!bakery || !campaign) {
    return (
      <EmptyState
        className="mx-auto mt-10 max-w-lg"
        title="No campaign yet"
        description="Configure the bakery profile first — the ad creative and audience are generated from it."
        action={
          <ButtonLink href="/setup" variant="primary" prefix={<IconArrowRight />}>
            Configure bakery
          </ButtonLink>
        }
      />
    );
  }

  const live = campaign.status === "active";

  const handleLaunch = () => {
    setLaunching(true);
    launchCampaign();
    setTimeout(() => router.push("/leads"), 1800);
  };

  return (
    <div className="animate-fade-up mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-1000">Campaign</h1>
          <p className="mt-1 text-sm text-gray-900">
            Generated from the bakery profile. Launch to start acquiring leads.
          </p>
        </div>
        <Badge tone={live ? "green" : "gray"} dot pulse={live}>
          {live ? "Delivering" : "Draft"}
        </Badge>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* ---------------------------------------------------------------- */}
        {/* Creative preview — a real ad unit, rendered dark.                  */}
        {/* ---------------------------------------------------------------- */}
        <Card className="overflow-hidden self-start">
          <div className="flex items-center gap-2.5 border-b border-gray-200 px-4 py-3">
            <div className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-1000">
              <IconMark className="size-3.5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-1000">
                {bakery.name}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-gray-700">
                Sponsored · Meta
              </p>
            </div>
          </div>

          <div className="grid-bg flex h-40 items-center justify-center border-b border-gray-200 bg-background">
            <span className="label-micro">Creative slot · 1200×628</span>
          </div>

          <div className="px-4 py-3">
            <p className="text-sm font-medium text-gray-1000">
              {campaign.headline}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-gray-900">
              {campaign.body}
            </p>
            <div className="mt-3 flex h-9 w-full cursor-default items-center justify-center rounded-md bg-solid text-sm font-medium text-on-solid">
              {campaign.cta}
            </div>
          </div>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Delivery configuration                                            */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <div className="grid gap-6 px-5 py-4 sm:grid-cols-2">
              <Metric
                label="Daily budget"
                value={`$${campaign.dailyBudget}`}
                unit="/ day"
                caption={`$${bakery.monthlyBudget}/month across Facebook & Instagram lead forms`}
              />
              <div>
                <SectionLabel>Target audience</SectionLabel>
                <p className="mt-2 text-sm leading-relaxed text-gray-1000">
                  {campaign.audience}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Post-launch flow" />
            <div className="px-5 py-3">
              <dl>
                <DataRow label="01 · Ad form submitted" value="Name + phone captured" />
                <DataRow label="02 · Auto-dial" value="Within 60s" mono />
                <DataRow label="03 · AI intake" value="Full order qualified" />
                <DataRow label="04 · Handoff" value="Order card, ready to quote" />
              </dl>
            </div>
          </Card>

          {live ? (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <p className="text-sm text-gray-900">
                  Campaign is delivering. Leads route to the pipeline
                  automatically.
                </p>
                <ButtonLink href="/leads" variant="primary" prefix={<IconArrowRight />}>
                  View pipeline
                </ButtonLink>
              </div>
            </Card>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="lg"
                loading={launching}
                onClick={handleLaunch}
              >
                {launching ? "Launching…" : "Launch campaign"}
              </Button>
              <Button
                size="lg"
                loading={busy}
                prefix={busy ? undefined : <IconRefresh />}
                onClick={() => void generateCampaign()}
              >
                {busy ? "Writing creative…" : "Regenerate creative"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
