import { redirect } from "next/navigation";

import { Nav } from "@/components/nav";
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
      <Nav userEmail={user.email ?? null} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </AppProvider>
  );
}
