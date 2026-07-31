"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Bakery, Campaign, Lead } from "./types";

interface AppState {
  bakery: Bakery | null;
  campaign: Campaign | null;
  leads: Lead[];
}

interface AppStore extends AppState {
  hydrated: boolean;
  busy: boolean;
  saveBakery: (bakery: Bakery) => Promise<void>;
  generateCampaign: () => Promise<void>;
  launchCampaign: () => Promise<
    { threadId: string; runId: string } | { error: string }
  >;
  simulateIncomingLead: () => Promise<void>;
  startAiCall: (leadId: string) => Promise<string | null>;
  updateLeadStatus: (leadId: string, status: Lead["status"]) => void;
  resetDemo: () => void;
}

const POLL_MS = 2500;
const EMPTY: AppState = { bakery: null, campaign: null, leads: [] };

const AppContext = createContext<AppStore | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);

  // Outstanding writes: the poll must not overwrite state we haven't persisted yet.
  const pendingWrites = useRef(0);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) return;
      const data = (await res.json()) as AppState;
      if (pendingWrites.current > 0) return;
      // Keep object identity stable when nothing changed — effects that
      // depend on this state shouldn't re-fire on every poll tick.
      setState((s) => (JSON.stringify(s) === JSON.stringify(data) ? s : data));
    } catch {
      /* server unreachable — keep showing what we have */
    } finally {
      setHydrated(true);
    }
  }, []);

  // Postgres is the source of truth; poll it and reconcile.
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const send = useCallback(
    async (path: string, method: "POST" | "PATCH", body?: unknown) => {
      pendingWrites.current += 1;
      try {
        return await fetch(path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        return null;
      } finally {
        pendingWrites.current -= 1;
      }
    },
    []
  );

  const saveBakery = useCallback(
    async (bakery: Bakery) => {
      setState((s) => ({ ...s, bakery }));
      setBusy(true);
      try {
        await send("/api/bakery", "POST", bakery);
        // A profile change means the ad creative is stale — regenerate it.
        await send("/api/campaign/generate", "POST");
      } finally {
        setBusy(false);
      }
      await refresh();
    },
    [refresh, send]
  );

  const generateCampaign = useCallback(async () => {
    setBusy(true);
    try {
      await send("/api/campaign/generate", "POST");
    } finally {
      setBusy(false);
    }
    await refresh();
  }, [refresh, send]);

  /** Hands the campaign to Pixero to publish into the Meta ad account. */
  const launchCampaign = useCallback(async () => {
    const res = await send("/api/campaign/launch", "POST");
    await refresh();
    if (!res) return { error: "Server unreachable — try again." };
    const data = (await res.json().catch(() => null)) as {
      threadId?: string;
      runId?: string;
      error?: string;
    } | null;
    if (!res.ok || !data?.threadId || !data.runId) {
      return { error: data?.error ?? `Launch failed (${res?.status}).` };
    }
    return { threadId: data.threadId, runId: data.runId };
  }, [refresh, send]);

  const simulateIncomingLead = useCallback(async () => {
    await send("/api/leads/simulate", "POST");
    await refresh();
  }, [refresh, send]);

  /** Places a real outbound AI call. Resolves to an error message, or null on success. */
  const startAiCall = useCallback(
    async (leadId: string): Promise<string | null> => {
      setState((s) => ({
        ...s,
        leads: s.leads.map((l) =>
          l.id === leadId ? { ...l, status: "calling" } : l
        ),
      }));
      const res = await send(`/api/leads/${leadId}/call`, "POST");
      await refresh();
      if (!res) return "Server unreachable — try again.";
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        return data?.error ?? `Call failed (${res.status}).`;
      }
      return null;
    },
    [refresh, send]
  );

  const updateLeadStatus = useCallback(
    (leadId: string, status: Lead["status"]) => {
      setState((s) => ({
        ...s,
        leads: s.leads.map((l) => (l.id === leadId ? { ...l, status } : l)),
      }));
      void send(`/api/leads/${leadId}`, "PATCH", { status });
    },
    [send]
  );

  const resetDemo = useCallback(() => {
    setState(EMPTY);
    void send("/api/reset", "POST").then(() => refresh());
  }, [refresh, send]);

  return (
    <AppContext.Provider
      value={{
        ...state,
        hydrated,
        busy,
        saveBakery,
        generateCampaign,
        launchCampaign,
        simulateIncomingLead,
        startAiCall,
        updateLeadStatus,
        resetDemo,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppStore {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
