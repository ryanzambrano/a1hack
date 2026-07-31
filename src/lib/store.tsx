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
import type { Bakery, Campaign, Lead } from "./types";

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

const STORAGE_KEY = "sweetleads-state";
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
  const activeCalls = useRef<Set<string>>(new Set());
  const leadCounter = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        // A call can't survive a page reload — park interrupted calls in follow-up.
        parsed.leads = parsed.leads.map((l) =>
          l.status === "calling" ? { ...l, status: "follow_up" } : l
        );
        leadCounter.current = parsed.leads.length;
        setState(parsed);
      }
    } catch {
      /* corrupted state — start fresh */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const pushBakeryToServer = useCallback((bakery: Bakery) => {
    void fetch("/api/bakery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bakery),
    }).catch(() => {});
  }, []);

  const saveBakery = useCallback(
    (bakery: Bakery) => {
      setState((s) => ({ ...s, bakery, campaign: buildCampaign(bakery) }));
      pushBakeryToServer(bakery);
    },
    [pushBakeryToServer]
  );

  // Poll the server for real phone-call leads and merge them into the pipeline.
  useEffect(() => {
    if (!hydrated) return;
    const tick = async () => {
      try {
        const res = await fetch("/api/live-leads");
        if (!res.ok) return;
        const data: { leads: Lead[]; hasBakery: boolean } = await res.json();
        setState((s) => {
          // Re-brief the voice agent if the server restarted and lost the profile.
          if (!data.hasBakery && s.bakery) pushBakeryToServer(s.bakery);
          if (!data.leads?.length) return s;
          const byId = new Map(s.leads.map((l) => [l.id, l] as const));
          let changed = false;
          for (const lead of data.leads) {
            const existing = byId.get(lead.id);
            if (!existing || JSON.stringify(existing) !== JSON.stringify(lead)) {
              byId.set(lead.id, lead);
              changed = true;
            }
          }
          if (!changed) return s;
          const merged = [...byId.values()].sort(
            (a, b) => b.createdAt - a.createdAt
          );
          return { ...s, leads: merged };
        });
      } catch {
        /* voice server unreachable — sim mode still works */
      }
    };
    void tick();
    const id = setInterval(tick, 2500);
    return () => clearInterval(id);
  }, [hydrated, pushBakeryToServer]);

  const generateCampaign = useCallback(() => {
    setState((s) =>
      s.bakery ? { ...s, campaign: buildCampaign(s.bakery) } : s
    );
  }, []);

  const addLead = useCallback(() => {
    setState((s) => {
      const lead: Lead = {
        ...makeDemoLead(leadCounter.current++),
        id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: Date.now(),
      };
      return { ...s, leads: [lead, ...s.leads] };
    });
  }, []);

  const launchCampaign = useCallback(() => {
    setState((s) =>
      s.campaign
        ? {
            ...s,
            campaign: { ...s.campaign, status: "active", launchedAt: Date.now() },
          }
        : s
    );
    // First lead arrives moments after launch.
    setTimeout(addLead, 4000);
  }, [addLead]);

  const updateLeadStatus = useCallback(
    (leadId: string, status: Lead["status"]) => {
      setState((s) => ({
        ...s,
        leads: s.leads.map((l) => (l.id === leadId ? { ...l, status } : l)),
      }));
    },
    []
  );

  const startAiCall = useCallback((leadId: string) => {
    if (activeCalls.current.has(leadId)) return;
    activeCalls.current.add(leadId);

    setState((s) => {
      const lead = s.leads.find((l) => l.id === leadId);
      if (!lead || !s.bakery) {
        activeCalls.current.delete(leadId);
        return s;
      }
      const script = buildCallScript(s.bakery.name, lead);

      let elapsed = 800;
      script.forEach((step) => {
        elapsed += step.delay;
        setTimeout(() => {
          setState((cur) => ({
            ...cur,
            leads: cur.leads.map((l) =>
              l.id === leadId
                ? {
                    ...l,
                    transcript: [
                      ...l.transcript,
                      { speaker: step.speaker, text: step.text },
                    ],
                  }
                : l
            ),
          }));
        }, elapsed);
      });

      setTimeout(() => {
        activeCalls.current.delete(leadId);
        setState((cur) => ({
          ...cur,
          leads: cur.leads.map((l) =>
            l.id === leadId
              ? {
                  ...l,
                  status: "qualified",
                  order: DEMO_ORDER,
                  callOutcome:
                    "Completed — customer answered all qualifying questions and confirmed the order details.",
                  nextAction: "Call customer today after 3 PM with a quote",
                }
              : l
          ),
        }));
      }, elapsed + 1500);

      return {
        ...s,
        leads: s.leads.map((l) =>
          l.id === leadId
            ? { ...l, status: "calling", transcript: [], order: null }
            : l
        ),
      };
    });
  }, []);

  const resetDemo = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    leadCounter.current = 0;
    setState(EMPTY);
  }, []);

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
