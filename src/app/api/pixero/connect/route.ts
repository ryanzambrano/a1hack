import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { authorizeUrl, makePkce } from "@/lib/server/pixero";

export const dynamic = "force-dynamic";

/** Starts the Pixero OAuth flow — send users here from a "Connect Pixero" button. */
export async function GET() {
  const { verifier, challenge, state } = makePkce();

  const jar = await cookies();
  jar.set("px_oauth", JSON.stringify({ verifier, state }), {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/pixero",
  });

  return NextResponse.redirect(authorizeUrl(challenge, state));
}
