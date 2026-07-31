import { createHash, randomBytes } from "node:crypto";

import { adminClient } from "@/lib/supabase/admin";

// SweetLeads is a registered Pixero OAuth client (dynamic registration,
// PKCE public client — no client secret). Tokens live in Supabase
// (pixero_connections, single workspace row) and refresh automatically.
const PIXERO_BASE = "https://pixero.ai";
const TOKEN_URL = `${PIXERO_BASE}/api/oauth/token`;
export const PIXERO_CLIENT_ID =
  process.env.PIXERO_CLIENT_ID ??
  "pxr_client_15384ab8c98bc61b14d2b49958391eccfdb528e24059b563c89f7ee9bd639a00";
export const PIXERO_SCOPES = "read generate deploy agent";

const CONNECTION_ID = "default";

export function redirectUri(): string {
  if (process.env.PIXERO_REDIRECT_URI) return process.env.PIXERO_REDIRECT_URI;
  return process.env.NODE_ENV === "development"
    ? "http://localhost:3000/api/pixero/callback"
    : "https://a1hack.vercel.app/api/pixero/callback";
}

export function makePkce(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(24).toString("base64url");
  return { verifier, challenge, state };
}

export function authorizeUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: PIXERO_CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: PIXERO_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${PIXERO_BASE}/oauth/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
}

interface ConnectionRow {
  id: string;
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  scope: string | null;
  expires_at: string | null;
  connected_at: string | null;
}

// pixero_connections isn't in the generated Database types; keep its
// accessor in one untyped spot instead of casting at every call site.
function connections() {
  return (adminClient() as any).from("pixero_connections");
}

async function saveTokens(tokens: TokenResponse): Promise<void> {
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;
  const { error } = await connections().upsert({
    id: CONNECTION_ID,
    access_token: tokens.access_token,
    ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    token_type: tokens.token_type ?? "Bearer",
    scope: tokens.scope ?? PIXERO_SCOPES,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`saving Pixero tokens failed: ${error.message}`);
}

async function requestTokens(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(
      `Pixero token endpoint ${res.status}: ${(await res.text()).slice(0, 300)}`
    );
  }
  return (await res.json()) as TokenResponse;
}

/** Exchange the authorization code from the callback; persists tokens. */
export async function exchangeCode(code: string, verifier: string): Promise<void> {
  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: PIXERO_CLIENT_ID,
      code_verifier: verifier,
    })
  );
  await saveTokens(tokens);
}

export async function getConnection(): Promise<ConnectionRow | null> {
  const { data, error } = await connections()
    .select("*")
    .eq("id", CONNECTION_ID)
    .maybeSingle();
  if (error) throw new Error(`reading Pixero connection failed: ${error.message}`);
  return (data as ConnectionRow | null) ?? null;
}

/** Valid access token for the workspace, refreshing if within 60s of expiry. */
export async function getPixeroToken(): Promise<string | null> {
  const conn = await getConnection();
  if (!conn) return null;

  const expiresSoon =
    conn.expires_at && new Date(conn.expires_at).getTime() - Date.now() < 60_000;
  if (!expiresSoon) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token; // hope it's a long-lived token

  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
      client_id: PIXERO_CLIENT_ID,
    })
  );
  await saveTokens(tokens);
  return tokens.access_token;
}

/* ------------------------------ MCP client ------------------------------ */

const MCP_URL = `${PIXERO_BASE}/api/mcp`;

function parseJsonRpc(text: string, contentType: string): unknown {
  // Streamable HTTP may answer as SSE — the JSON-RPC response rides a data: line.
  if (contentType.includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      if (line.startsWith("data:")) {
        try {
          return JSON.parse(line.slice(5).trim());
        } catch {
          /* keep scanning */
        }
      }
    }
    throw new Error("no JSON-RPC payload in SSE response");
  }
  return JSON.parse(text);
}

async function mcpRequest(
  token: string,
  sessionId: string | null,
  body: object
): Promise<{ payload: unknown; sessionId: string | null }> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Pixero MCP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const newSession = res.headers.get("mcp-session-id") ?? sessionId;
  if (res.status === 202) return { payload: null, sessionId: newSession };
  const payload = parseJsonRpc(
    await res.text(),
    res.headers.get("content-type") ?? ""
  );
  return { payload, sessionId: newSession };
}

/**
 * Call one Pixero MCP tool as the connected workspace.
 * Opens a fresh MCP session per call — fine at our volume.
 */
export async function pixeroTool<T = unknown>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const token = await getPixeroToken();
  if (!token) throw new Error("Pixero is not connected — visit /api/pixero/connect.");

  const init = await mcpRequest(token, null, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "sweetleads", version: "1.0" },
    },
  });
  await mcpRequest(token, init.sessionId, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  }).catch(() => undefined);

  const { payload } = await mcpRequest(token, init.sessionId, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name, arguments: args },
  });

  const rpc = payload as {
    error?: { message?: string };
    result?: { isError?: boolean; content?: { type: string; text?: string }[] };
  };
  if (rpc.error) throw new Error(`Pixero ${name}: ${rpc.error.message}`);
  const text = (rpc.result?.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
  if (rpc.result?.isError) throw new Error(`Pixero ${name}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/** Authenticated fetch against pixero.ai on behalf of the workspace. */
export async function pixeroFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getPixeroToken();
  if (!token) {
    throw new Error("Pixero is not connected — visit /api/pixero/connect first.");
  }
  return fetch(`${PIXERO_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
}
