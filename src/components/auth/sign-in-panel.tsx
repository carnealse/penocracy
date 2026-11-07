"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function SignInPanel() {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    if (mode === "signup") {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Could not create the account.");
        setPending(false);
        return;
      }
    }
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      setError("That email and password did not match.");
      setPending(false);
      return;
    }
    window.location.assign("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Penocracy</p>
      <h1 className="wordmark mt-3 text-5xl">Your shelves are waiting.</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        A private manuscript studio. Sign in to open your books. Nothing on these shelves is public.
      </p>
      <form onSubmit={submit} className="mt-8 grid max-w-md gap-3 rounded-2xl border border-border bg-card p-6">
        <div className="flex gap-2 text-sm">
          <button type="button" className={mode === "signup" ? "font-semibold" : "text-muted-foreground"} onClick={() => setMode("signup")}>Create account</button>
          <button type="button" className={mode === "signin" ? "font-semibold" : "text-muted-foreground"} onClick={() => setMode("signin")}>Sign in</button>
        </div>
        {mode === "signup" && (
          <label className="grid gap-1 text-sm">
            Name
            <input className="rounded-md border border-border bg-background px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        )}
        <label className="grid gap-1 text-sm">
          Email
          <input required type="email" className="rounded-md border border-border bg-background px-3 py-2" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          Password
          <input required minLength={8} type="password" className="rounded-md border border-border bg-background px-3 py-2" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={pending} className="rounded-md bg-accent px-4 py-2 text-accent-foreground">
          {pending ? "Opening the library…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
