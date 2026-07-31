"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/lib/store";

export default function CampaignPage() {
  const { bakery, campaign, hydrated, launchCampaign, generateCampaign } =
    useApp();
  const router = useRouter();
  const [launching, setLaunching] = useState(false);

  if (!hydrated) return null;

  if (!bakery || !campaign) {
    return (
      <div className="animate-fade-up flex flex-col items-start gap-3 py-12">
        <h1 className="text-2xl font-semibold text-stone-800">Campaign</h1>
        <p className="text-stone-500">
          Set up your bakery first — we&apos;ll generate the ad campaign from
          your profile.
        </p>
        <Link
          href="/setup"
          className="rounded-xl bg-rose-600 px-4 py-2.5 font-semibold text-white hover:bg-rose-700"
        >
          Go to Bakery Setup →
        </Link>
      </div>
    );
  }

  const live = campaign.status === "active";

  const handleLaunch = () => {
    setLaunching(true);
    launchCampaign();
    setTimeout(() => router.push("/leads"), 1800);
  };

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">Campaign</h1>
          <p className="mt-1 text-sm text-stone-500">
            Generated from your bakery profile. Launch it to start receiving
            leads.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            live
              ? "bg-green-100 text-green-700"
              : "bg-stone-100 text-stone-600"
          }`}
        >
          {live ? "● Live on Meta" : "Draft"}
        </span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* Ad creative preview */}
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-lg">
              🍰
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-800">
                {bakery.name}
              </p>
              <p className="text-xs text-stone-400">Sponsored · Meta</p>
            </div>
          </div>
          <div className="flex h-44 items-center justify-center bg-gradient-to-br from-rose-100 via-amber-50 to-rose-200 text-6xl">
            🎂
          </div>
          <div className="px-4 py-3">
            <p className="font-semibold text-stone-800">{campaign.headline}</p>
            <p className="mt-1 text-sm text-stone-600">{campaign.body}</p>
            <button
              type="button"
              className="mt-3 w-full cursor-default rounded-lg bg-stone-800 py-2 text-sm font-semibold text-white"
            >
              {campaign.cta}
            </button>
          </div>
        </div>

        {/* Campaign settings + launch */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
              Target audience
            </h2>
            <p className="mt-2 text-sm text-stone-700">{campaign.audience}</p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
              Budget
            </h2>
            <p className="mt-2 text-2xl font-semibold text-stone-800">
              ${campaign.dailyBudget}
              <span className="text-sm font-normal text-stone-400"> / day</span>
            </p>
            <p className="text-xs text-stone-400">
              ${bakery.monthlyBudget}/month across Facebook &amp; Instagram lead
              forms
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
              What happens after launch
            </h2>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-stone-600">
              <li>Customers submit their name &amp; phone via the ad</li>
              <li>SweetLeads calls each lead within a minute</li>
              <li>The AI collects full cake-order details</li>
              <li>You get a qualified order card, ready to quote</li>
            </ol>
          </div>

          {live ? (
            <div className="flex items-center justify-between rounded-2xl border border-green-200 bg-green-50 p-5">
              <p className="text-sm font-medium text-green-800">
                Campaign is live. Leads will appear in your pipeline.
              </p>
              <Link
                href="/leads"
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                View leads →
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleLaunch}
                disabled={launching}
                className="animate-pulse-ring rounded-xl bg-rose-600 px-8 py-4 text-lg font-bold text-white shadow-md transition-colors hover:bg-rose-700 disabled:opacity-60"
              >
                {launching ? "Launching…" : "🚀 Launch Campaign"}
              </button>
              <button
                onClick={generateCampaign}
                className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50"
              >
                ↻ Regenerate creative
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
