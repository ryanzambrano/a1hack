"use client";

import { useEffect, useRef, useState } from "react";
import { RetellWebClient } from "retell-client-js-sdk";

const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200";

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
        `Calling ${phone} from ${data.from} — pick up your phone! (call ${data.callId})`
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
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold text-stone-800">
        Test the intake agent
      </h1>
      <p className="mt-1 text-sm text-stone-500">
        SweetLeads-Operator on Retell — try it in the browser or have it call a
        real phone.
      </p>

      <section className="mt-8 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-medium text-stone-800">📞 Outbound test call</h2>
        <p className="mt-1 text-sm text-stone-500">
          The agent calls this number and runs cake intake.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+15125550148"
            inputMode="tel"
          />
          <button
            onClick={placeCall}
            disabled={dialing}
            className="shrink-0 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
          >
            {dialing ? "Dialing…" : "Call me"}
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-medium text-stone-800">🎙️ Talk in the browser</h2>
        <p className="mt-1 text-sm text-stone-500">
          No phone needed — uses your mic, instant.
        </p>
        <button
          onClick={toggleWebCall}
          disabled={webCallConnecting}
          className={`mt-3 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
            webCallActive
              ? "bg-stone-700 hover:bg-stone-800"
              : "bg-rose-600 hover:bg-rose-700"
          }`}
        >
          {webCallConnecting
            ? "Connecting…"
            : webCallActive
              ? "End call"
              : "Start talking"}
        </button>
      </section>

      {status && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {status}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </main>
  );
}
