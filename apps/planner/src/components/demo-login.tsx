"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

interface DemoAccount {
  email: string;
  name: string;
  tier: "free" | "pro";
}

export function DemoLogin({ accounts }: { accounts: DemoAccount[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(email: string) {
    setPending(email);
    setError(null);
    try {
      const response = await fetch("/api/demo/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not sign in");
      window.location.assign("/dashboard");
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Could not sign in");
      setPending(null);
    }
  }

  if (accounts.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-mist-300">
        No demo accounts found. Run <code className="text-accent-300">npm run db:migrate</code> and{" "}
        <code className="text-accent-300">npm run db:seed</code> against your database, then
        reload this page.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}
      {accounts.map((account) => (
        <button
          key={account.email}
          type="button"
          onClick={() => signIn(account.email)}
          disabled={pending !== null}
          className={cn(
            "group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-left transition",
            "hover:border-accent-400/40 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent-400/25 to-violet-500/25 text-sm font-bold text-mist-100">
            {account.name
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-mist-100">
                {account.name}
              </span>
              <span
                className={cn(
                  "chip",
                  account.tier === "pro"
                    ? "bg-accent-400/15 text-accent-300"
                    : "bg-white/[0.07] text-mist-400",
                )}
              >
                {account.tier === "pro" ? (
                  <>
                    <Sparkles size={10} /> Pro
                  </>
                ) : (
                  "Free"
                )}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-mist-400">
              {account.email}
            </span>
          </span>
          {pending === account.email ? (
            <Loader2 className="animate-spin text-mist-400" size={16} />
          ) : (
            <ArrowRight
              size={16}
              className="text-mist-500 transition group-hover:translate-x-0.5 group-hover:text-accent-300"
            />
          )}
        </button>
      ))}
      <p className="pt-1 text-center text-[11px] text-mist-500">
        Demo mode uses a signed local session cookie. Set{" "}
        <code className="text-mist-400">AUTH_MODE=auth0</code> for real Auth0 login.
      </p>
    </div>
  );
}
