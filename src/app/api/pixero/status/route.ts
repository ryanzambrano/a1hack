import { NextResponse } from "next/server";

import { getConnection } from "@/lib/server/pixero";

export const dynamic = "force-dynamic";

/** Whether the workspace has a live Pixero connection (for UI badges/buttons). */
export async function GET() {
  try {
    const conn = await getConnection();
    return NextResponse.json({
      connected: Boolean(conn),
      scope: conn?.scope ?? null,
      connectedAt: conn?.connected_at ?? null,
    });
  } catch {
    // Table may not exist yet (migration not applied) — report unconnected.
    return NextResponse.json({ connected: false, scope: null, connectedAt: null });
  }
}
