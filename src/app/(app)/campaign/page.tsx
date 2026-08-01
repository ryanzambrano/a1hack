"use client";

import { useEffect, useRef, useState } from "react";

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
  Note,
  SectionLabel,
  StatusDot,
} from "@/components/ui";
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

  const idle = !publishing && !publishMsg && !error && !campaigns;

  return (
    <Card className="mt-4">
      <CardHeader
        title="Live on Meta"
        description="Ads and campaigns from the connected Pixero workspace."
        actions={
          <>
            <Button
              variant="primary"
              loading={publishing}
              onClick={() => void publish()}
            >
              {publishing ? "Publishing via Pixero…" : "Publish to Meta"}
            </Button>
            <Button
              loading={loading}
              prefix={loading ? undefined : <IconRefresh />}
              onClick={() => void load()}
            >
              {loading ? "Fetching…" : campaigns ? "Refresh" : "Show live ads"}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 px-5 py-4">
        {publishing && (
          <p className="text-sm text-gray-900">
            Pixero is staging the creative and launch plan — this takes a couple of
            minutes. The campaign is created paused, so nothing spends yet.
          </p>
        )}

        {publishMsg && (
          <Note tone="green" className="whitespace-pre-wrap">
            {publishMsg}
          </Note>
        )}

        {error && <Note tone="red">{error}</Note>}

        {campaigns?.length === 0 && (
          <p className="text-sm text-gray-900">
            No ads visible on the connected Meta accounts yet.
          </p>
        )}

        {campaigns?.map((c) => (
          <div
            key={c.name}
            className="rounded-lg border border-gray-200 bg-background px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={c.live ? "green" : "gray"} dot pulse={c.live}>
                {c.live ? "Live" : "Paused"}
              </Badge>
              <p className="min-w-0 truncate text-sm font-medium text-gray-1000">
                {c.name}
              </p>
            </div>
            <ul className="mt-2 space-y-1">
              {c.ads.map((ad, i) => (
                <li
                  key={`${ad.name}-${i}`}
                  className="flex items-center gap-2 text-sm text-gray-900"
                >
                  <StatusDot tone={ad.status === "ACTIVE" ? "green" : "gray"} />
                  <span className="min-w-0 truncate">{ad.name}</span>
                  {ad.adsetName && (
                    <span className="shrink-0 font-mono text-[11px] text-gray-700">
                      · {ad.adsetName}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {idle && (
          <p className="text-sm text-gray-900">
            Nothing pulled yet — fetch the current state of the ad account, or publish
            this campaign into it.
          </p>
        )}
      </div>
    </Card>
  );
}

export default function CampaignPage() {
  const { bakery, campaign, hydrated, busy, launchCampaign, generateCampaign } =
    useApp();
  const [launching, setLaunching] = useState(false);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [deployFailed, setDeployFailed] = useState(false);
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
        setDeployFailed(false);
        setDeployStatus(`Deployed to Meta (paused). ${s.message ?? ""}`);
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
    setDeployFailed(true);
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
    setDeployFailed(false);
    startRef.current = Date.now();
    setElapsed(0);
    tickRef.current = setInterval(
      () => setElapsed(Math.round((Date.now() - startRef.current) / 1000)),
      1000
    );
    await runAttempt(1);
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
                onClick={() => void handleLaunch()}
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

          {streamLine && (
            <p className="flex items-center gap-2 font-mono text-xs text-gray-900">
              <StatusDot tone="blue" pulse />
              <span className="truncate">{streamLine}</span>
              <span className="shrink-0 text-gray-700 tnum">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
              </span>
            </p>
          )}

          {deployStatus && (
            <Note
              tone={deployFailed ? "amber" : "green"}
              className="whitespace-pre-wrap"
            >
              {deployStatus}
            </Note>
          )}
        </div>
      </div>

      <MetaLivePanel />
    </div>
  );
}
