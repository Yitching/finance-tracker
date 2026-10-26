import { useState } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-5xl mb-4">🪙</div>
        <h1 className="text-3xl font-bold tracking-tight">Lazy Ledger</h1>
        <p className="mt-2 text-ink-soft">
          Type what you bought. That's it. You'll stay signed in on this device.
        </p>

        {sent ? (
          <div className="mt-8 rounded-2xl bg-card p-5 shadow-sm">
            <p className="font-medium">Check your inbox 📬</p>
            <p className="mt-1 text-sm text-ink-soft">
              Tap the link we sent to <b>{email}</b>. Open it on this phone so you stay signed in here.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-3">
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
            <button
              disabled={busy}
              className="w-full rounded-2xl bg-accent px-4 py-4 text-lg font-semibold text-white active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send me a magic link"}
            </button>
            {error && <p className="text-sm text-danger">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
