import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { exchangeCode } from "@/lib/server/pixero";

export const dynamic = "force-dynamic";

/** Pixero redirects here after the user authorizes; stores workspace tokens. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const backToApp = new URL("/setup", url.origin);

  const jar = await cookies();
  const stashed = jar.get("px_oauth")?.value;
  jar.delete("px_oauth");

  try {
    if (!code || !state || !stashed) throw new Error("missing code/state");
    const { verifier, state: expected } = JSON.parse(stashed) as {
      verifier: string;
      state: string;
    };
    if (state !== expected) throw new Error("state mismatch");

    await exchangeCode(code, verifier);
    backToApp.searchParams.set("pixero", "connected");
  } catch (err) {
    console.error("pixero oauth failed", err);
    backToApp.searchParams.set("pixero", "error");
  }

  return NextResponse.redirect(backToApp);
}
