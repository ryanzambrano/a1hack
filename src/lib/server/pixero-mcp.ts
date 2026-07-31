import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { getPixeroToken } from "./pixero";

// Pixero's MCP endpoint accepts the same workspace OAuth tokens our
// /api/pixero/connect flow stores (same authorization server + scopes),
// so the site's agent talks to Pixero as an MCP client.
const PIXERO_MCP_URL = "https://pixero.ai/api/mcp";

export interface PixeroTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Opens an authenticated MCP session, runs fn, always closes the session. */
export async function withPixeroMcp<T>(
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const token = await getPixeroToken();
  if (!token) {
    throw new Error("Pixero is not connected — visit /api/pixero/connect first.");
  }

  const transport = new StreamableHTTPClientTransport(new URL(PIXERO_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "sweetleads", version: "1.0.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

export async function listPixeroTools(): Promise<PixeroTool[]> {
  return withPixeroMcp(async (client) => {
    const { tools } = await client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: "object" },
    }));
  });
}

export interface MetaAd {
  name: string;
  adsetName: string;
  status: string;
}

export interface MetaCampaign {
  name: string;
  live: boolean;
  ads: MetaAd[];
}

/** Ads grouped by campaign from the Meta accounts synced to Pixero — names
 *  and live status only, no performance metrics. */
export async function getMetaCampaigns(): Promise<MetaCampaign[]> {
  return withPixeroMcp(async (client) => {
    const result = await client.callTool({
      name: "get_ad_performance",
      arguments: { limit: 50, sortBy: "spend" },
    });
    const data = JSON.parse(toolResultText(result)) as {
      ads?: Array<{ name?: string; campaignName?: string; adsetName?: string; status?: string }>;
    };

    const byCampaign = new Map<string, MetaCampaign>();
    for (const ad of data.ads ?? []) {
      const campaign = ad.campaignName ?? "Unknown campaign";
      const entry =
        byCampaign.get(campaign) ?? { name: campaign, live: false, ads: [] };
      entry.ads.push({
        name: ad.name ?? "Untitled ad",
        adsetName: ad.adsetName ?? "",
        status: ad.status ?? "UNKNOWN",
      });
      entry.live ||= ad.status === "ACTIVE";
      byCampaign.set(campaign, entry);
    }
    return [...byCampaign.values()].sort(
      (a, b) => Number(b.live) - Number(a.live)
    );
  });
}

/** Flattens an MCP tool result into a string the LLM can read. */
export function toolResultText(result: unknown): string {
  const r = result as {
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: unknown;
    toolResult?: unknown;
    isError?: boolean;
  };
  const parts: string[] = [];
  for (const item of r.content ?? []) {
    if (item.type === "text" && item.text) parts.push(item.text);
    else parts.push(JSON.stringify(item));
  }
  if (r.structuredContent) parts.push(JSON.stringify(r.structuredContent));
  if (r.toolResult !== undefined) parts.push(JSON.stringify(r.toolResult));
  const text = parts.join("\n") || "(empty result)";
  return r.isError ? `TOOL ERROR: ${text}` : text;
}
