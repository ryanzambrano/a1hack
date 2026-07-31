"use client";

import Link from "next/link";
import { useState } from "react";

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
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span className="text-3xl">🍰</span>
        <span className="text-xl text-stone-800">
          Sweet<span className="text-rose-600">Leads</span>
        </span>
      </Link>

      <form
        onSubmit={submit}
        className="mt-8 w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6"
      >
        <h1 className="text-lg font-semibold text-stone-800">
          {mode === "sign-in" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {mode === "sign-in"
            ? "Sign in to see your leads and campaigns."
            : "Sign up to start booking cake orders."}
        </p>

        <label className="mt-5 block text-sm font-medium text-stone-700">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 outline-none focus:border-rose-500"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-stone-700">
          Password
          <input
            type="password"
            required
            minLength={6}
            autoComplete={
              mode === "sign-in" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 outline-none focus:border-rose-500"
          />
        </label>

        {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
        {notice && <p className="mt-4 text-sm text-emerald-600">{notice}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-full bg-rose-600 py-2.5 font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
        >
          {busy ? "Working…" : mode === "sign-in" ? "Sign in" : "Sign up"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
            setNotice(null);
          }}
          className="mt-4 w-full text-center text-sm text-stone-500 hover:text-stone-700"
        >
          {mode === "sign-in"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
