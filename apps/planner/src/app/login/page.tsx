import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { DemoLogin } from "@/components/demo-login";
import { Logo } from "@/components/logo";
import { query } from "@/lib/db";
import { isAuth0Mode } from "@/lib/env";
import { getSessionUser } from "@/lib/session";

interface DemoAccount {
  email: string;
  name: string;
  tier: "free" | "pro";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ logout?: string }>;
}) {
  if (isAuth0Mode()) redirect("/auth/login");

  const session = await getSessionUser();
  if (session) redirect("/dashboard");

  const { logout } = await searchParams;
  let accounts: DemoAccount[] = [];
  let databaseError = false;
  try {
    accounts = await query<DemoAccount>(
      `SELECT email, name, tier FROM users WHERE id LIKE 'demo|%' ORDER BY tier DESC, name`,
    );
  } catch {
    databaseError = true;
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex flex-col px-5 py-8 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Northstar home">
            <Logo />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-mist-400 transition hover:text-mist-100"
          >
            <ArrowLeft size={14} /> Back
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-300">
            Welcome back
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-mist-100 sm:text-4xl">
            Sign in to your year.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-mist-300">
            {isAuth0Mode()
              ? "You will be redirected to Auth0 to complete sign-in."
              : "Pick a demo identity to explore Northstar. Each account sees the same data model with different roles and plan limits."}
          </p>

          {logout && (
            <p className="mt-4 rounded-xl border border-accent-400/20 bg-accent-400/10 px-3 py-2 text-sm text-accent-200">
              You have been signed out.
            </p>
          )}
          {databaseError && (
            <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              Could not reach Postgres. Check <code>DATABASE_URL</code>, then run{" "}
              <code>npm run db:migrate</code>.
            </p>
          )}

          <div className="mt-8">
            <DemoLogin accounts={accounts} />
          </div>

          <div className="mt-8 flex items-center gap-2 text-[11px] text-mist-500">
            <ShieldCheck size={14} className="text-accent-400" />
            Auth0 handles identity. OpenFGA enforces per-workspace access.
          </div>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden border-l border-white/5 bg-ink-900/40 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(40rem_28rem_at_70%_10%,rgba(52,211,153,0.12),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-center px-14">
          <blockquote className="text-2xl font-semibold leading-snug text-mist-100">
            “The plan is not the point. Revisiting the plan is.”
          </blockquote>
          <p className="mt-4 text-sm text-mist-400">Northstar, year one</p>

          <div className="mt-12 space-y-4 border-t border-white/10 pt-8">
            {[
              "Quarterly goals with milestone roll-up",
              "A bucket list with dates and budgets",
              "Editors and viewers per workspace",
              "Pro exports and unlimited items",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-mist-300">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-400/15">
                  <Check size={13} className="text-accent-300" />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
