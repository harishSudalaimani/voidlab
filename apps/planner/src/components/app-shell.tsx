"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import {
  CalendarRange,
  CalendarCheck2,
  ChevronDown,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Settings,
  Sparkles,
} from "lucide-react";
import { RoleBadge } from "@/components/badges";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/types";

interface ShellUser {
  name: string;
  email: string;
  picture: string | null;
}

interface ShellWorkspace {
  id: string;
  name: string;
  role: Role;
  isPersonal: boolean;
  ownerEmail: string;
}

const NAV = [
  { href: "/today", label: "Today", icon: CalendarCheck2 },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/planner", label: "Yearly planner", icon: CalendarRange },
  { href: "/bucket-list", label: "Bucket list", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AppShell({
  user,
  workspaces,
  currentWorkspaceId,
  pro,
  authMode,
  children,
}: {
  user: ShellUser;
  workspaces: ShellWorkspace[];
  currentWorkspaceId: string | null;
  pro: boolean;
  authMode: "demo" | "auth0";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [switching, setSwitching] = useState(false);
  const current = workspaces.find((workspace) => workspace.id === currentWorkspaceId);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function switchWorkspace(workspaceId: string) {
    setSwitching(true);
    try {
      const response = await fetch("/api/workspaces/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!response.ok) throw new Error("Could not switch workspace");
      startTransition(() => router.refresh());
    } finally {
      setSwitching(false);
    }
  }

  async function logout() {
    if (authMode === "auth0") {
      window.location.assign("/auth/logout");
      return;
    }
    await fetch("/api/demo/logout", { method: "POST" });
    window.location.assign("/login");
  }

  const workspaceSwitcher = (
    <div>
      <div className="relative">
        <select
          aria-label="Workspace"
          value={currentWorkspaceId ?? ""}
          disabled={switching || pending || workspaces.length === 0}
          onChange={(event) => switchWorkspace(event.target.value)}
          className="w-full appearance-none rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-3 pr-9 text-sm font-medium text-mist-100 outline-none transition hover:bg-white/[0.07] focus:border-accent-400/60 disabled:opacity-60"
        >
          {workspaces.length === 0 && <option value="">No workspace</option>}
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id} className="bg-ink-900">
              {workspace.name}
              {workspace.isPersonal ? "" : ` · ${workspace.ownerEmail}`}
            </option>
          ))}
        </select>
        <ChevronDown
          size={15}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mist-400"
        />
      </div>
      {current && (
        <div className="mt-2 flex items-center justify-between px-1">
          <span className="text-[10px] uppercase tracking-[0.14em] text-mist-500">
            {current.isPersonal ? "Personal" : "Shared workspace"}
          </span>
          <RoleBadge role={current.role} />
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-white/5 bg-ink-950/70 px-4 py-5 backdrop-blur-xl lg:flex">
        <div className="px-2">
          <Link href="/dashboard" aria-label="Northstar dashboard">
            <Logo />
          </Link>
        </div>

        <div className="mt-7">{workspaceSwitcher}</div>

        <nav className="mt-6 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn("nav-link", isActive(item.href) && "nav-link-active")}
            >
              <item.icon size={17} className={isActive(item.href) ? "text-accent-300" : ""} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-3 pt-6">
          {!pro && (
            <div className="rounded-2xl border border-accent-400/20 bg-gradient-to-br from-accent-400/10 to-violet-500/10 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-mist-100">
                <Sparkles size={14} className="text-accent-300" /> Unlock Pro
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-mist-400">
                Unlimited goals, collaboration and exports.
              </p>
              <Link href="/settings#billing" className="btn btn-primary btn-sm mt-3 w-full">
                Upgrade
              </Link>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-accent-400/25 to-violet-500/25 text-xs font-bold text-mist-100">
              {user.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.picture} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(user.name)
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-mist-100">{user.name}</p>
              <p className="truncate text-[11px] text-mist-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-lg p-2 text-mist-400 transition hover:bg-white/10 hover:text-mist-100"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/5 bg-ink-950/80 px-4 backdrop-blur-xl sm:px-6 lg:hidden">
          <Link href="/dashboard" aria-label="Northstar dashboard">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            {current && <RoleBadge role={current.role} />}
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-mist-300"
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-10">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/90 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-mist-400",
                isActive(item.href) && "text-accent-300",
              )}
            >
              <item.icon size={18} />
              {item.label.split(" ")[0]}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
