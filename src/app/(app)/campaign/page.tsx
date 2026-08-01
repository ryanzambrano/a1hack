"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";

interface MetaCampaign {
  name: string;
  live: boolean;
  ads: { name: string; adsetName: string; status: string }[];
}

/** "Show the ads and the campaign that's live" — pulled through Pixero MCP. */
function MetaLivePanel() {
  const [campaigns, setCampaigns] = useState<MetaCampaign[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

  const publish = async () => {
    setPublishing(true);
    setPublishMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/campaign/launch-meta", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPublishMsg(
        `Published to ${data.adAccountId} (created paused). ${data.publish}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pixero/ads");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCampaigns(data.campaigns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ads");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
            Live on Meta
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Ads and campaigns from your connected Pixero workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void publish()}
            disabled={publishing}
            className="rounded-xl bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-900 disabled:opacity-50"
          >
            {publishing ? "Publishing via Pixero…" : "Publish to Meta"}
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
          >
            {loading
              ? "Fetching from Pixero…"
              : campaigns
                ? "↻ Refresh"
                : "Show live ads"}
          </button>
        </div>
      </div>

      {publishing && (
        <p className="mt-3 text-sm text-stone-500">
          Pixero is staging the creative and launch plan — this takes a couple
          of minutes. The campaign is created paused, so nothing spends yet.
        </p>
      )}
      {publishMsg && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-emerald-700">
          {publishMsg}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      {campaigns && campaigns.length === 0 && (
        <p className="mt-3 text-sm text-stone-500">
          No ads visible on the connected Meta accounts yet.
        </p>
      )}

      {campaigns && campaigns.length > 0 && (
        <div className="mt-4 space-y-4">
          {campaigns.map((c) => (
            <div key={c.name} className="rounded-xl border border-stone-100 p-4">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    c.live
                      ? "bg-green-100 text-green-700"
                      : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {c.live ? "● Live" : "Paused"}
                </span>
                <p className="font-semibold text-stone-800">{c.name}</p>
              </div>
              <ul className="mt-2 space-y-1">
                {c.ads.map((ad, i) => (
                  <li
                    key={`${ad.name}-${i}`}
                    className="flex items-center gap-2 text-sm text-stone-600"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        ad.status === "ACTIVE" ? "bg-green-500" : "bg-stone-300"
                      }`}
                    />
                    {ad.name}
                    {ad.adsetName && (
                      <span className="text-xs text-stone-400">
                        · {ad.adsetName}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CampaignPage() {
  const { bakery, campaign, hydrated, busy, launchCampaign, generateCampaign } =
    useApp();
  const [launching, setLaunching] = useState(false);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [streamLine, setStreamLine] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);

  const stopStream = () => {
    esRef.current?.close();
    esRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  };

  useEffect(() => stopStream, []);

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

  const MAX_ATTEMPTS = 3;

  const runAttempt = async (attempt: number) => {
    const label = attempt > 1 ? `Attempt ${attempt}/${MAX_ATTEMPTS} — ` : "";
    setStreamLine(`${label}Handing the campaign to Pixero…`);
    const result = await launchCampaign();
    if ("error" in result) {
      finishFailed(`Launch failed: ${result.error}`, attempt);
      return;
    }

    const es = new EventSource(
      `/api/campaign/launch/stream?threadId=${result.threadId}&runId=${result.runId}`
    );
    esRef.current = es;
    es.onmessage = (e) => {
      const s = JSON.parse(e.data) as { status: string; message?: string | null };
      if (s.status === "deployed") {
        stopStream();
        setStreamLine(null);
        setLaunching(false);
        setDeployStatus(`✅ Deployed to Meta (paused). ${s.message ?? ""}`);
      } else if (s.status === "incomplete" || /error|failed/i.test(s.status)) {
        stopStream();
        finishFailed(s.message ?? s.status, attempt);
      } else if (s.status === "poll_error") {
        setStreamLine(`${label}Connection hiccup (${s.message ?? "retrying"})…`);
      } else {
        setStreamLine(
          `${label}Pixero agent working — strategy, ad creative, staging, publish`
        );
      }
    };
    // Dropped connections auto-reconnect; keep the ticker running meanwhile.
    es.onerror = () => setStreamLine(`${label}Reconnecting to Pixero stream…`);
  };

  const finishFailed = (message: string, attempt: number) => {
    if (attempt < MAX_ATTEMPTS) {
      setStreamLine(`Attempt ${attempt} didn't deploy — retrying…`);
      void runAttempt(attempt + 1);
      return;
    }
    setStreamLine(null);
    setLaunching(false);
    const blockedByStaging = /no brief is open|open the brief|requires an open/i.test(
      message
    );
    setDeployStatus(
      blockedByStaging
        ? `Pixero blocked headless staging after ${MAX_ATTEMPTS} attempts (its staging tool needs the brief open in the Pixero canvas). The strategy and ad creative ARE generated. To finish: open the newest SweetLeads brief in Pixero, tell the agent "stage the campaign plan", then click "Publish to Meta" below — it finds the staged plan and publishes it to your ad account.\n\nLast agent report: ${message}`
        : `Deploy failed after ${MAX_ATTEMPTS} attempts: ${message}`
    );
  };

  const handleLaunch = async () => {
    setLaunching(true);
    setDeployStatus(null);
    startRef.current = Date.now();
    setElapsed(0);
    tickRef.current = setInterval(
      () => setElapsed(Math.round((Date.now() - startRef.current) / 1000)),
      1000
    );
    await runAttempt(1);
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
          {live ? "● Active" : "Draft"}
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
                onClick={() => void generateCampaign()}
                disabled={busy}
                className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
              >
                {busy ? "Writing new creative…" : "↻ Regenerate creative"}
              </button>
            </div>
          )}

          {streamLine && (
            <p className="flex items-center gap-2 font-mono text-xs text-stone-500">
              <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" />
              <span className="truncate">{streamLine}</span>
              <span className="shrink-0 tabular-nums text-stone-400">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
              </span>
            </p>
          )}

          {deployStatus && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 whitespace-pre-wrap">
              {deployStatus}
            </div>
          )}
        </div>
      </div>

      <MetaLivePanel />
    </div>
  );
}
