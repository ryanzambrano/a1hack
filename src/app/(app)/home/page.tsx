"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { IconMark } from "@/components/icons";
import { useApp } from "@/lib/store";

export default function Home() {
  const { bakery, hydrated } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    router.replace(bakery ? "/leads" : "/setup");
  }, [hydrated, bakery, router]);

  return (
    <div className="flex flex-col items-center gap-3 py-32 text-center">
      <IconMark className="size-6 animate-pulse text-gray-500" />
      <p className="label-micro">Loading workspace</p>
    </div>
  );
}
