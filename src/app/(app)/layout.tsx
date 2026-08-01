import { redirect } from "next/navigation";

import { AppShell } from "@/components/nav";
import { AppProvider } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

// The proxy already redirects signed-out visitors optimistically; this is the
// authoritative check on the server before any app data renders.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppProvider>
      <AppShell userEmail={user.email ?? null}>{children}</AppShell>
    </AppProvider>
  );
}
