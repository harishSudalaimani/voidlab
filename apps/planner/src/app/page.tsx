import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  Check,
  Download,
  ListChecks,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { ProgressBar } from "@/components/progress";
import { getSessionUser } from "@/lib/session";

const features = [
  {
    icon: CalendarRange,
    title: "A yearly planner that fits on one screen",
    body: "Set goals per quarter, break them into milestones and watch progress roll up automatically. No spreadsheets, no guilt.",
  },
  {
    icon: ListChecks,
    title: "A bucket list with a plan",
    body: "Capture the big ideas, add dates, budgets and priorities, then move them from “someday” to done.",
  },
  {
    icon: TrendingUp,
    title: "Progress you can actually see",
    body: "Quarterly completion, milestone burn-down and year-elapsed rings keep the plan honest.",
  },
  {
    icon: Users,
    title: "Share with the people in it",
    body: "Invite an accountability partner as an editor or give a mentor read-only access. Roles are enforced per workspace.",
  },
  {
    icon: Download,
    title: "Your data leaves with you",
    body: "Export your goals and bucket list as JSON or CSV whenever you want. Pro plans include unlimited items.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by design",
    body: "Auth0 handles sign-in and sessions. OpenFGA decides exactly who can view or edit each workspace.",
  },
];

const quarters = [
  { name: "Q1", done: 4, total: 5, progress: 100 },
  { name: "Q2", done: 2, total: 4, progress: 50 },
  { name: "Q3", done: 1, total: 4, progress: 25 },
  { name: "Q4", done: 0, total: 3, progress: 0 },
];

export default async function LandingPage() {
  const session = await getSessionUser();
  const startHref = session ? "/dashboard" : "/login";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Northstar home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-mist-300 md:flex">
            <a className="transition hover:text-mist-100" href="#features">
              Features
            </a>
            <a className="transition hover:text-mist-100" href="#how">
              How it works
            </a>
            <a className="transition hover:text-mist-100" href="#pricing">
              Pricing
            </a>
            <a className="transition hover:text-mist-100" href="#security">
              Security
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href={startHref} className="btn btn-ghost btn-sm sm:hidden">
              {session ? "Open" : "Sign in"}
            </Link>
            <Link href={startHref} className="btn btn-ghost btn-sm hidden sm:inline-flex">
              {session ? "Open planner" : "Sign in"}
            </Link>
            <Link href={startHref} className="btn btn-primary btn-sm">
              {session ? "Dashboard" : "Start free"}
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
            <div className="animate-rise">
              <span className="chip border border-accent-400/20 bg-accent-400/10 text-accent-300">
                <Sparkles size={12} />
                Auth0 sign-in · OpenFGA authorization
              </span>
              <h1 className="mt-6 text-balance text-5xl font-black leading-[0.98] tracking-tight text-mist-100 sm:text-6xl lg:text-7xl">
                Make the year
                <span className="bg-gradient-to-r from-accent-300 via-accent-400 to-violet-400 bg-clip-text text-transparent">
                  {" "}
                  count.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-balance text-lg leading-relaxed text-mist-300">
                Northstar is a yearly planner and bucket list in one calm workspace.
                Set the goals, break them into milestones and keep the big adventures
                moving — quarter by quarter.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href={startHref} className="btn btn-primary px-6 py-3 text-base">
                  Plan your year
                  <ArrowRight size={17} />
                </Link>
                <a href="#pricing" className="btn btn-ghost px-6 py-3 text-base">
                  See pricing
                </a>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 text-xs font-medium text-mist-400">
                <span className="flex items-center gap-1.5">
                  <Check size={14} className="text-accent-400" /> Free forever plan
                </span>
                <span className="flex items-center gap-1.5">
                  <Check size={14} className="text-accent-400" /> No credit card
                </span>
                <span className="flex items-center gap-1.5">
                  <Check size={14} className="text-accent-400" /> Export anytime
                </span>
              </div>
            </div>

            <div className="animate-rise-delay relative">
              <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-accent-400/20 via-transparent to-violet-500/20 blur-2xl" />
              <div className="surface-strong relative p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist-400">
                      Yearly planner
                    </p>
                    <p className="mt-1 text-xl font-bold text-mist-100">2026</p>
                  </div>
                  <span className="chip bg-accent-400/15 text-accent-300">On track</span>
                </div>

                <div className="mt-5 rounded-xl border border-white/10 bg-ink-900/80 p-4">
                  <div className="flex items-center justify-between text-xs text-mist-400">
                    <span>Year progress</span>
                    <span className="font-semibold text-mist-200">61%</span>
                  </div>
                  <ProgressBar value={61} className="mt-2 h-2" />
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-white/[0.04] px-2 py-2">
                      <p className="text-base font-bold text-mist-100">7</p>
                      <p className="text-[10px] text-mist-500">goals</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.04] px-2 py-2">
                      <p className="text-base font-bold text-mist-100">14</p>
                      <p className="text-[10px] text-mist-500">milestones</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.04] px-2 py-2">
                      <p className="text-base font-bold text-mist-100">5</p>
                      <p className="text-[10px] text-mist-500">adventures</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2">
                  {quarters.map((quarter) => (
                    <div
                      key={quarter.name}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-bold text-mist-200">{quarter.name}</span>
                        <span className="text-[10px] text-mist-500">
                          {quarter.done}/{quarter.total}
                        </span>
                      </div>
                      <ProgressBar
                        value={quarter.progress}
                        tone={quarter.progress === 100 ? "violet" : "accent"}
                        className="mt-2"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-2">
                  {[
                    ["Ship Northstar 1.0", "Career", 50, "accent"],
                    ["Run a sub-2h half marathon", "Health", 33, "violet"],
                  ].map(([title, category, value, tone]) => (
                    <div
                      key={title as string}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-400/10 text-[10px] font-bold text-accent-300">
                        {category as string}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-mist-100">
                          {title as string}
                        </p>
                        <ProgressBar
                          value={value as number}
                          tone={tone as "accent" | "violet"}
                          className="mt-1.5"
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-mist-300">
                        {value as number}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-t border-white/5">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-300">
                Everything a planner should do
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-mist-100 sm:text-4xl">
                The paid-planner feature set, without the clutter.
              </h2>
              <p className="mt-4 text-mist-300">
                Built for people who want a yearly plan they will revisit in March,
                not a notebook that dies in January.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="surface group p-5 transition hover:border-white/20 hover:bg-white/[0.055]"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-accent-400/20 bg-accent-400/10 text-accent-300">
                    <feature.icon size={18} />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-mist-100">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-mist-400">
                    {feature.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-white/5">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300">
                  How it works
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-mist-100 sm:text-4xl">
                  Three steps. Then keep showing up.
                </h2>
                <p className="mt-4 max-w-lg text-mist-300">
                  Northstar stays deliberately small. One place for the year, one place
                  for the list, one honest progress number.
                </p>
              </div>
              <div className="space-y-3">
                {[
                  {
                    step: "01",
                    title: "Sign in with Auth0",
                    body: "Social, email or passkey login through your Auth0 tenant. Sessions stay encrypted and short-lived.",
                  },
                  {
                    step: "02",
                    title: "Set the year and the list",
                    body: "Add goals to quarters, attach milestones, and pull your bucket list into the same plan.",
                  },
                  {
                    step: "03",
                    title: "Invite your people",
                    body: "OpenFGA grants each person exactly the role they need — owner, editor or viewer — per workspace.",
                  },
                ].map((item) => (
                  <div key={item.step} className="surface flex gap-4 p-5">
                    <span className="text-lg font-black text-accent-400/70">{item.step}</span>
                    <div>
                      <h3 className="font-semibold text-mist-100">{item.title}</h3>
                      <p className="mt-1 text-sm text-mist-400">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-t border-white/5">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-300">
                Pricing
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-mist-100 sm:text-4xl">
                Start free. Go Pro when the plan gets big.
              </h2>
              <p className="mt-4 text-mist-300">
                Every plan includes the yearly planner, bucket list and Auth0 sign-in.
              </p>
            </div>

            <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
              <div className="surface p-6 sm:p-8">
                <h3 className="text-lg font-semibold text-mist-100">Free</h3>
                <p className="mt-1 text-sm text-mist-400">For a focused year.</p>
                <p className="mt-6 text-4xl font-black text-mist-100">
                  $0
                  <span className="text-sm font-medium text-mist-500"> forever</span>
                </p>
                <ul className="mt-6 space-y-3 text-sm text-mist-300">
                  {[
                    "Yearly planner with quarterly goals",
                    "Up to 3 goals per year",
                    "Up to 10 bucket list items",
                    "Milestones and progress tracking",
                    "Personal workspace",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check size={15} className="mt-0.5 shrink-0 text-accent-400" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href={startHref} className="btn btn-ghost mt-8 w-full">
                  Start free
                </Link>
              </div>

              <div className="relative rounded-2xl border border-accent-400/30 bg-gradient-to-b from-accent-400/[0.09] to-violet-500/[0.05] p-6 shadow-[0_25px_80px_-40px_rgba(52,211,153,0.5)] sm:p-8">
                <span className="absolute right-5 top-5 chip bg-accent-400 text-ink-950">
                  Most popular
                </span>
                <h3 className="text-lg font-semibold text-mist-100">Pro</h3>
                <p className="mt-1 text-sm text-mist-300">For ambitious years.</p>
                <p className="mt-6 text-4xl font-black text-mist-100">
                  $8
                  <span className="text-sm font-medium text-mist-400"> / month</span>
                </p>
                <p className="mt-1 text-xs text-mist-500">Billed annually · $10 month-to-month</p>
                <ul className="mt-6 space-y-3 text-sm text-mist-200">
                  {[
                    "Unlimited goals and bucket list items",
                    "Invite editors and viewers",
                    "Fine-grained roles powered by OpenFGA",
                    "JSON and CSV export",
                    "Workspace renaming and priority support",
                    "Everything in Free",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check size={15} className="mt-0.5 shrink-0 text-accent-300" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href={startHref} className="btn btn-primary mt-8 w-full">
                  Go Pro
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="border-t border-white/5">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <div className="surface-strong grid gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
              <div>
                <span className="chip border border-violet-400/20 bg-violet-400/10 text-violet-300">
                  <Lock size={12} />
                  Security architecture
                </span>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-mist-100">
                  Authentication and authorization, separated properly.
                </h2>
                <p className="mt-4 text-mist-300">
                  Northstar never invents its own login. Auth0 owns identity, MFA and
                  sessions. OpenFGA owns the relationship graph — who can view, edit or
                  own each workspace — and every API call is checked against it.
                </p>
              </div>
              <div className="grid gap-3">
                <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-ink-900/70 p-4">
                  <ShieldCheck className="mt-0.5 shrink-0 text-accent-400" size={19} />
                  <div>
                    <p className="text-sm font-semibold text-mist-100">Auth0 → identity</p>
                    <p className="mt-1 text-xs leading-relaxed text-mist-400">
                      OIDC login, encrypted session cookies, MFA and social connections.
                      The app only ever reads a verified session.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-ink-900/70 p-4">
                  <Users className="mt-0.5 shrink-0 text-violet-300" size={19} />
                  <div>
                    <p className="text-sm font-semibold text-mist-100">OpenFGA → access</p>
                    <p className="mt-1 text-xs leading-relaxed text-mist-400">
                      Workspace roles and Pro entitlements are relationship tuples.
                      Checks run server-side before every read and write.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-ink-900/70 p-4">
                  <Download className="mt-0.5 shrink-0 text-sky-300" size={19} />
                  <div>
                    <p className="text-sm font-semibold text-mist-100">Postgres → data</p>
                    <p className="mt-1 text-xs leading-relaxed text-mist-400">
                      Goals, milestones and bucket items live in Postgres. Authorization
                      data stays in OpenFGA, where it can be audited.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-5 py-8 text-xs text-mist-500 sm:flex-row sm:items-center sm:px-8">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span>© {new Date().getFullYear()} Voidlab. Plan well.</span>
          </div>
          <div className="flex items-center gap-5">
            <a className="transition hover:text-mist-300" href="#features">
              Features
            </a>
            <a className="transition hover:text-mist-300" href="#pricing">
              Pricing
            </a>
            <Link className="transition hover:text-mist-300" href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
