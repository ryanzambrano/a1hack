"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "@/lib/store";

export default function Home() {
  const { bakery, hydrated } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    router.replace(bakery ? "/leads" : "/setup");
  }, [hydrated, bakery, router]);

  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <span className="text-4xl">🍰</span>
      <h1 className="text-2xl font-semibold text-stone-800">SweetLeads</h1>
      <p className="text-stone-500">
        Turning Meta ads into qualified cake orders…
      </p>
    </div>
  );
}
