"use client";

import Link from "next/link";
import { useState } from "react";

import { Wordmark } from "@/components/icons";
import { Button, Card, Field, Input, Note } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const supabase = createClient();

    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      // Full navigation so the server sees the fresh auth cookies.
      window.location.assign("/home");
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    if (data.session) {
      window.location.assign("/home");
      return;
    }
    setNotice("Check your email to confirm your account, then sign in.");
    setBusy(false);
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-16">
      {/* Warmth first: an oven-glow wash, with the instrument grid faint
          underneath it rather than the other way round. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_50%_35%,black,transparent_65%)]" />
        <div className="absolute left-1/2 top-[-18rem] size-[38rem] -translate-x-1/2 rounded-full bg-honey-glow/25 blur-[120px]" />
      </div>

      <Link
        href="/"
        className="relative rounded-md text-xl text-gray-1000 transition-opacity hover:opacity-80"
      >
        <Wordmark />
      </Link>
      <p className="relative mt-2 text-sm text-gray-900">
        Ads in. Cake orders out.
      </p>

      <Card className="relative mt-8 w-full max-w-sm">
        <form onSubmit={submit} className="px-6 py-6">
          <h1 className="font-display text-xl font-semibold text-gray-1000">
            {mode === "sign-in" ? "Welcome back" : "Open your bakery"}
          </h1>
          <p className="mt-1 text-sm text-gray-900">
            {mode === "sign-in"
              ? "Pick up where your pipeline left off."
              : "Set up a workspace and start taking orders."}
          </p>

          <div className="mt-6 grid gap-4">
            <Field label="Email">
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@bakery.com"
              />
            </Field>

            <Field label="Password">
              <Input
                type="password"
                required
                minLength={6}
                autoComplete={
                  mode === "sign-in" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </div>

          {error && (
            <Note tone="red" className="mt-4">
              {error}
            </Note>
          )}
          {notice && (
            <Note tone="green" className="mt-4">
              {notice}
            </Note>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={busy}
            className="mt-6 w-full"
          >
            {busy ? "Working…" : mode === "sign-in" ? "Sign in" : "Sign up"}
          </Button>
        </form>

        <div className="rounded-b-xl border-t border-gray-200 bg-background/60 px-6 py-3 text-center">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setError(null);
              setNotice(null);
            }}
            className="rounded text-sm text-gray-900 transition-colors hover:text-gray-1000"
          >
            {mode === "sign-in"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </Card>
    </div>
  );
}
