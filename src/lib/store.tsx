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
import { buildCallScript, DEMO_ORDER, makeDemoLead } from "./demo";
import type { Bakery, Campaign, Lead, TranscriptMessage } from "./types";

interface AppState {
  bakery: Bakery | null;
  campaign: Campaign | null;
  leads: Lead[];
}

interface AppStore extends AppState {
  hydrated: boolean;
  saveBakery: (bakery: Bakery) => void;
  generateCampaign: () => void;
  launchCampaign: () => void;
  simulateIncomingLead: () => void;
  startAiCall: (leadId: string) => void;
  updateLeadStatus: (leadId: string, status: Lead["status"]) => void;
  resetDemo: () => void;
}

interface StateResponse {
  bakery: Bakery | null;
  campaign: Campaign | null;
  leads: Lead[];
}

const POLL_MS = 2500;
const EMPTY: AppState = { bakery: null, campaign: null, leads: [] };

const AppContext = createContext<AppStore | null>(null);

function buildCampaign(bakery: Bakery): Campaign {
  const city = bakery.location.split(",")[0].trim();
  const topCake = bakery.cakeTypes[0]?.toLowerCase() || "custom";
  return {
    id: "camp-1",
    headline: `Need a custom ${topCake} cake in ${city}? 🎂`,
    body: `${bakery.name} makes ${bakery.cakeTypes
      .slice(0, 3)
      .join(", ")
      .toLowerCase()} cakes from $${bakery.priceMin}. Tell us about your event and get a personal quote in minutes — no phone tag required.`,
    cta: "Get My Quote",
    audience: `People within 15 miles of ${city} · Ages 25–55 · Interests: birthdays, weddings, party planning, custom cakes`,
    dailyBudget: Math.max(5, Math.round(bakery.monthlyBudget / 30)),
    status: "draft",
    launchedAt: null,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  // Leads whose simulated call is mid-animation: the poll must not overwrite them.
  const activeCalls = useRef<Set<string>>(new Set());
  // Outstanding writes: the poll must not overwrite state we haven't persisted yet.
  const pendingWrites = useRef(0);
  const leadCounter = useRef(0);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const send = useCallback(
    async (path: string, method: "POST" | "PATCH", body?: unknown) => {
      pendingWrites.current += 1;
      try {
        await fetch(path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        /* server unreachable — the optimistic update stands until the next poll */
      } finally {
        pendingWrites.current -= 1;
      }
    },
    []
  );

  // Postgres is the source of truth; poll it and reconcile.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) return;
        const data = (await res.json()) as StateResponse;
        if (cancelled || pendingWrites.current > 0) return;

        setState((s) => ({
          bakery: data.bakery,
          campaign: data.campaign,
          leads: data.leads.map(
            (lead) =>
              (activeCalls.current.has(lead.id)
                ? s.leads.find((l) => l.id === lead.id)
                : null) ?? lead
          ),
        }));
        leadCounter.current = Math.max(leadCounter.current, data.leads.length);
      } catch {
        /* server unreachable — keep showing what we have */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };

    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const saveBakery = useCallback(
    (bakery: Bakery) => {
      const campaign = buildCampaign(bakery);
      setState((s) => ({ ...s, bakery, campaign }));
      void (async () => {
        // The campaign row references the bakery, so it has to land first.
        await send("/api/bakery", "POST", bakery);
        await send("/api/campaign", "POST", campaign);
      })();
    },
    [send]
  );

  const generateCampaign = useCallback(() => {
    const { bakery } = stateRef.current;
    if (!bakery) return;
    const campaign = buildCampaign(bakery);
    setState((s) => ({ ...s, campaign }));
    void send("/api/campaign", "POST", campaign);
  }, [send]);

  const addLead = useCallback(() => {
    const lead: Lead = {
      ...makeDemoLead(leadCounter.current++),
      id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
    };
    setState((s) => ({ ...s, leads: [lead, ...s.leads] }));
    void send("/api/leads", "POST", lead);
  }, [send]);

  const launchCampaign = useCallback(() => {
    const { campaign } = stateRef.current;
    if (!campaign) return;
    const launched: Campaign = {
      ...campaign,
      status: "active",
      launchedAt: Date.now(),
    };
    setState((s) => ({ ...s, campaign: launched }));
    void send("/api/campaign", "POST", launched);
    // First lead arrives moments after launch.
    setTimeout(addLead, 4000);
  }, [addLead, send]);

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

  const startAiCall = useCallback(
    (leadId: string) => {
      if (activeCalls.current.has(leadId)) return;

      const { leads, bakery } = stateRef.current;
      const lead = leads.find((l) => l.id === leadId);
      if (!lead || !bakery) return;

      activeCalls.current.add(leadId);
      const script = buildCallScript(bakery.name, lead);
      const transcript: TranscriptMessage[] = [];

      setState((s) => ({
        ...s,
        leads: s.leads.map((l) =>
          l.id === leadId
            ? { ...l, status: "calling", transcript: [], order: null }
            : l
        ),
      }));

      let elapsed = 800;
      script.forEach((step) => {
        elapsed += step.delay;
        setTimeout(() => {
          const line: TranscriptMessage = {
            speaker: step.speaker,
            text: step.text,
          };
          transcript.push(line);
          setState((cur) => ({
            ...cur,
            leads: cur.leads.map((l) =>
              l.id === leadId
                ? { ...l, transcript: [...l.transcript, line] }
                : l
            ),
          }));
        }, elapsed);
      });

      setTimeout(() => {
        const result = {
          status: "qualified" as const,
          order: DEMO_ORDER,
          callOutcome:
            "Completed — customer answered all qualifying questions and confirmed the order details.",
          nextAction: "Call customer today after 3 PM with a quote",
        };
        setState((cur) => ({
          ...cur,
          leads: cur.leads.map((l) =>
            l.id === leadId ? { ...l, ...result } : l
          ),
        }));
        // Release the lead back to the poll only once the call is persisted.
        void send(`/api/leads/${leadId}`, "PATCH", {
          ...result,
          transcript,
        }).finally(() => activeCalls.current.delete(leadId));
      }, elapsed + 1500);
    },
    [send]
  );

  const resetDemo = useCallback(() => {
    activeCalls.current.clear();
    leadCounter.current = 0;
    setState(EMPTY);
    void send("/api/reset", "POST");
  }, [send]);

  return (
    <AppContext.Provider
      value={{
        ...state,
        hydrated,
        saveBakery,
        generateCampaign,
        launchCampaign,
        simulateIncomingLead: addLead,
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
