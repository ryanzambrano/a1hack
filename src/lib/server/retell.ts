const RETELL_BASE = "https://api.retellai.com";

// From the exported "SweetLeads-Operator" agent JSON.
const SWEETLEADS_LLM_ID = "llm_7f465dca654fdf5dee49d3f7f70c";
const SWEETLEADS_VOICE = "retell-Cimo";

export function retellConfigured(): boolean {
  return Boolean(process.env.RETELL_API_KEY);
}

export async function retellFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const key = process.env.RETELL_API_KEY;
  if (!key) throw new Error("RETELL_API_KEY is not set in .env.local");

  const res = await fetch(`${RETELL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(
      `Retell ${path} failed (${res.status}): ${(await res.text()).slice(0, 300)}`
    );
  }
  return (await res.json()) as T;
}

let cachedAgentId: string | null = null;

/**
 * Resolve the SweetLeads agent: env override, then an existing agent built on
 * our Retell LLM, then create one from that LLM as a last resort.
 */
export async function resolveAgentId(): Promise<string> {
  if (process.env.RETELL_AGENT_ID) return process.env.RETELL_AGENT_ID;
  if (cachedAgentId) return cachedAgentId;

  type AgentSummary = {
    agent_id: string;
    response_engine?: { type?: string; llm_id?: string };
  };
  const agents = await retellFetch<AgentSummary[]>("/list-agents");
  const existing = agents.find(
    (a) => a.response_engine?.llm_id === SWEETLEADS_LLM_ID
  );
  if (existing) {
    cachedAgentId = existing.agent_id;
    return cachedAgentId;
  }

  const created = await retellFetch<{ agent_id: string }>("/create-agent", {
    method: "POST",
    body: JSON.stringify({
      agent_name: "SweetLeads-Operator",
      voice_id: SWEETLEADS_VOICE,
      response_engine: { type: "retell-llm", llm_id: SWEETLEADS_LLM_ID },
    }),
  });
  cachedAgentId = created.agent_id;
  return cachedAgentId;
}

/** First outbound-capable number on the Retell account, unless overridden. */
export async function resolveFromNumber(): Promise<string> {
  if (process.env.RETELL_FROM_NUMBER) return process.env.RETELL_FROM_NUMBER;

  const numbers = await retellFetch<{ phone_number: string }[]>(
    "/list-phone-numbers"
  );
  if (!numbers.length) {
    throw new Error(
      "No phone number on the Retell account. Buy one in the Retell dashboard (Phone Numbers → Buy) or set RETELL_FROM_NUMBER."
    );
  }
  return numbers[0].phone_number;
}
