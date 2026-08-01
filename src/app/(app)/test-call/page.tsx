"use client";

import { useEffect, useRef, useState } from "react";
import { RetellWebClient } from "retell-client-js-sdk";

import { IconMic, IconPhone } from "@/components/icons";
import {
  Button,
  Card,
  CardHeader,
  Input,
  Note,
  StatusDot,
} from "@/components/ui";

export default function TestCallPage() {
  const [phone, setPhone] = useState("+1");
  const [dialing, setDialing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [webCallActive, setWebCallActive] = useState(false);
  const [webCallConnecting, setWebCallConnecting] = useState(false);
  const webClient = useRef<RetellWebClient | null>(null);

  useEffect(() => {
    const client = new RetellWebClient();
    webClient.current = client;
    client.on("call_started", () => {
      setWebCallConnecting(false);
      setWebCallActive(true);
      setStatus("Mic is live — talk to the agent.");
    });
    client.on("call_ended", () => {
      setWebCallActive(false);
      setWebCallConnecting(false);
      setStatus("Web call ended.");
    });
    client.on("error", (e) => {
      setWebCallActive(false);
      setWebCallConnecting(false);
      setError(`Web call error: ${String(e)}`);
    });
    return () => client.stopCall();
  }, []);

  const placeCall = async () => {
    setDialing(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/retell/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStatus(
        `Calling ${phone} from ${data.from} — pick up your phone! (call ${data.callId})`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDialing(false);
    }
  };

  const toggleWebCall = async () => {
    setError(null);
    if (webCallActive) {
      webClient.current?.stopCall();
      return;
    }
    setWebCallConnecting(true);
    try {
      const res = await fetch("/api/retell/web-call", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await webClient.current?.startCall({ accessToken: data.accessToken });
    } catch (err) {
      setWebCallConnecting(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="animate-fade-up mx-auto w-full max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-1000">Agent console</h1>
          <p className="mt-1 text-sm text-gray-900">
            Exercise the intake agent directly, without going through a campaign.
          </p>
        </div>
        <span className="rounded bg-alpha-100 px-2 py-1 font-mono text-[11px] text-gray-900">
          SweetLeads-Operator · Retell
        </span>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Outbound test call"
          description="The agent dials this number and runs the full cake-intake script."
        />
        <div className="flex flex-wrap gap-2 px-5 py-4">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+15125550148"
            inputMode="tel"
            className="min-w-48 flex-1 font-mono tnum"
          />
          <Button
            variant="primary"
            prefix={dialing ? undefined : <IconPhone />}
            loading={dialing}
            onClick={placeCall}
          >
            {dialing ? "Dialing…" : "Call me"}
          </Button>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Browser session"
          description="No phone required — routes your mic straight to the agent."
          actions={
            webCallActive ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-900">
                <StatusDot tone="green" pulse />
                Connected
              </span>
            ) : undefined
          }
        />
        <div className="px-5 py-4">
          <Button
            variant={webCallActive ? "error" : "primary"}
            prefix={webCallConnecting ? undefined : <IconMic />}
            loading={webCallConnecting}
            onClick={toggleWebCall}
          >
            {webCallConnecting
              ? "Connecting…"
              : webCallActive
                ? "End call"
                : "Start talking"}
          </Button>
        </div>
      </Card>

      {status && (
        <Note tone="green" className="mt-4">
          {status}
        </Note>
      )}
      {error && (
        <Note tone="red" title="Call failed" className="mt-4">
          {error}
        </Note>
      )}
    </div>
  );
}
