"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Download,
  KeyRound,
  Loader2,
  MailPlus,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { RoleBadge } from "@/components/badges";
import { ErrorBanner, Spinner } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import type { Entitlements, WorkspaceMember } from "@/lib/types";

interface SettingsPanelsProps {
  user: { name: string; email: string; picture: string | null; tier: string };
  workspace: { id: string; name: string; role: string; ownerEmail: string };
  members: WorkspaceMember[];
  entitlements: Entitlements;
  isOwner: boolean;
  demoMode: boolean;
  fgaConfigured: boolean;
}

export function SettingsPanels({
  user,
  workspace,
  members,
  entitlements,
  isOwner,
  demoMode,
  fgaConfigured,
}: SettingsPanelsProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <section className="surface p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-accent-400/25 to-violet-500/25 text-lg font-bold text-mist-100">
            {user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.picture} alt="" className="h-full w-full object-cover" />
            ) : (
              user.name
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()
            )}
          </span>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-mist-100">
              {user.name}
              <span className="chip bg-white/[0.07] text-mist-300">Free</span>
            </h2>
            <p className="truncate text-sm text-mist-400">{user.email}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-mist-500">
              <RoleBadge role={workspace.role as "owner" | "editor" | "viewer"} /> in{" "}
              {workspace.name}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <InfoTile
            icon={UserRound}
            label="Identity"
            value={demoMode ? "Demo session" : "Auth0"}
            hint={demoMode ? "Signed cookie (dev)" : "OIDC / MFA ready"}
          />
          <InfoTile
            icon={ShieldCheck}
            label="Authorization"
            value={fgaConfigured ? "OpenFGA" : "Postgres fallback"}
            hint={fgaConfigured ? "Relationship checks" : "Set FGA_* env vars"}
          />
          <InfoTile
            icon={KeyRound}
            label="Workspace role"
            value={workspace.role}
            hint={isOwner ? "Full control" : "Granted by owner"}
          />
        </div>
      </section>

      <WorkspaceSection
        workspace={workspace}
        isOwner={isOwner}
        onChanged={refresh}
        setError={setError}
      />

      <MembersSection
        members={members}
        isOwner={isOwner}
        canCollaborate={entitlements.canCollaborate}
        onChanged={refresh}
        setError={setError}
      />

      <section className="surface p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-mist-100">
          <Download size={17} className="text-accent-300" /> Export your data
        </h2>
        <p className="mt-1 text-sm text-mist-400">
          Download a copy of your yearly planner and bucket list.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/api/export?format=json" className="btn btn-ghost btn-sm">
            <Download size={13} /> Everything (JSON)
          </a>
          <a href="/api/export?format=csv&dataset=goals" className="btn btn-ghost btn-sm">
            <Download size={13} /> Goals (CSV)
          </a>
          <a href="/api/export?format=csv&dataset=bucket" className="btn btn-ghost btn-sm">
            <Download size={13} /> Bucket list (CSV)
          </a>
        </div>
      </section>
    </div>
  );
}

function WorkspaceSection({
  workspace,
  isOwner,
  onChanged,
  setError,
}: {
  workspace: { id: string; name: string };
  isOwner: boolean;
  onChanged: () => void;
  setError: (message: string | null) => void;
}) {
  const [name, setName] = useState(workspace.name);
  const [saving, setSaving] = useState(false);

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/workspaces", {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      onChanged();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Could not rename");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-mist-100">
        <Users size={17} className="text-accent-300" /> Workspace
      </h2>
      <p className="mt-1 text-sm text-mist-400">
        This is the container your goals, bucket list and members share.
      </p>
      {isOwner ? (
        <form onSubmit={rename} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            className="input flex-1"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            aria-label="Workspace name"
            required
          />
          <button type="submit" className="btn btn-ghost" disabled={saving || name === workspace.name}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Save name
          </button>
        </form>
      ) : (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-mist-400">
          Only the workspace owner can rename it.
        </p>
      )}
    </section>
  );
}

function MembersSection({
  members,
  isOwner,
  canCollaborate,
  onChanged,
  setError,
}: {
  members: WorkspaceMember[];
  isOwner: boolean;
  canCollaborate: boolean;
  onChanged: () => void;
  setError: (message: string | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setInviting(true);
    setError(null);
    try {
      await apiFetch("/api/workspaces/members", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setEmail("");
      onChanged();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Could not invite");
    } finally {
      setInviting(false);
    }
  }

  async function updateRole(id: string, nextRole: "editor" | "viewer") {
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(`/api/workspaces/members/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      onChanged();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update role");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this person's access?")) return;
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(`/api/workspaces/members/${id}`, { method: "DELETE" });
      onChanged();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-mist-100">
            <Users size={17} className="text-accent-300" /> Members
          </h2>
          <p className="mt-1 text-sm text-mist-400">
            Editors can change goals; viewers can only read. Access is checked in OpenFGA.
          </p>
        </div>
        <span className="chip bg-white/[0.06] text-mist-400">{members.length} people</span>
      </div>

      <div className="mt-4 space-y-2">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent-400/20 to-violet-500/20 text-[10px] font-bold text-mist-100">
              {(member.name ?? member.email)
                .split(/[\s@]+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-mist-100">
                {member.name ?? member.email}
                {member.userId === null && (
                  <span className="ml-2 text-[10px] font-normal text-mist-500">
                    invite pending
                  </span>
                )}
              </p>
              <p className="truncate text-[11px] text-mist-500">{member.email}</p>
            </div>
            {member.role === "owner" ? (
              <RoleBadge role="owner" />
            ) : isOwner ? (
              <div className="flex items-center gap-1">
                <select
                  value={member.role}
                  disabled={busyId === member.id}
                  onChange={(event) =>
                    updateRole(member.id, event.target.value as "editor" | "viewer")
                  }
                  className="rounded-lg border border-white/10 bg-ink-900/80 px-2 py-1.5 text-xs text-mist-200 outline-none"
                  aria-label={`Role for ${member.email}`}
                >
                  <option value="viewer" className="bg-ink-900">
                    Viewer
                  </option>
                  <option value="editor" className="bg-ink-900">
                    Editor
                  </option>
                </select>
                <button
                  type="button"
                  onClick={() => remove(member.id)}
                  disabled={busyId === member.id}
                  className="rounded-lg p-1.5 text-mist-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                  aria-label={`Remove ${member.email}`}
                >
                  {busyId === member.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>
            ) : (
              <RoleBadge role={member.role} />
            )}
          </div>
        ))}
      </div>

      {isOwner && (
        <div className="mt-4 border-t border-white/10 pt-4">
          {canCollaborate && (
            <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <MailPlus
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-500"
                />
                <input
                  type="email"
                  required
                  className="input pl-9"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="teammate@example.com"
                  aria-label="Invite email"
                />
              </div>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as "editor" | "viewer")}
                className="input w-auto"
                aria-label="Invite role"
              >
                <option value="viewer" className="bg-ink-900">
                  Viewer
                </option>
                <option value="editor" className="bg-ink-900">
                  Editor
                </option>
              </select>
              <button type="submit" className="btn btn-primary" disabled={inviting}>
                {inviting ? <Loader2 size={15} className="animate-spin" /> : <MailPlus size={15} />}
                Invite
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-mist-500">
        <Icon size={12} className="text-accent-400" /> {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold capitalize text-mist-100">{value}</p>
      <p className="truncate text-[10px] text-mist-500">{hint}</p>
    </div>
  );
}
