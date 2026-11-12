import { useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Email + password sign-in. No emails are sent, so there's no rate limit
 * and nothing to click. Accounts are created in the Supabase dashboard
 * (sign-ups are switched off), so only you can use your AI credits.
 */
export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Wrong email or password."
          : error.message,
      );
    }
  }

  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-5xl mb-4">🪙</div>
        <h1 className="text-3xl font-extrabold tracking-tight">Lazy Ledger</h1>
        <p className="mt-2 text-ink-soft">
          Type what you bought. That's it. You'll stay signed in on this device.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-3 rounded-3xl bg-card p-4 shadow-lg shadow-orange-200/50 ring-1 ring-line dark:shadow-none">
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl bg-card px-4 py-4 text-lg shadow-sm outline-none ring-accent focus:ring-2"
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl bg-card px-4 py-4 text-lg shadow-sm outline-none ring-accent focus:ring-2"
          />
          <button
            disabled={busy}
            className="bg-pop-gradient w-full rounded-2xl px-4 py-4 text-lg font-bold text-white shadow-md shadow-pink-200/70 active:scale-[0.98] disabled:opacity-60 dark:shadow-none"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
      </div>
    </main>
  );
}