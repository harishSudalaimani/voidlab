import { SettingsPanels } from "@/components/settings-panels";
import { requireAppContext } from "@/lib/context";
import { isAuth0Mode, isFgaConfigured } from "@/lib/env";
import { getWorkspaceMembers } from "@/lib/planner";

export default async function SettingsPage() {
  const context = await requireAppContext();
  const workspace = context.workspace;
  if (!workspace) {
    return (
      <div className="surface p-8 text-center text-sm text-mist-300">
        No workspace available. Reload the page to finish provisioning.
      </div>
    );
  }

  const members = await getWorkspaceMembers(workspace.id);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-300">
          Settings
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-mist-100 sm:text-4xl">
          Your account and workspace.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-mist-300">
          Identity comes from Auth0. Roles and plan entitlements are enforced with
          OpenFGA, so everything you see here is scoped to your access.
        </p>
      </header>

      <SettingsPanels
        user={{
          name: context.user.name,
          email: context.user.email,
          picture: context.user.picture,
          tier: context.user.tier,
        }}
        workspace={{
          id: workspace.id,
          name: workspace.name,
          role: workspace.role,
          ownerEmail: workspace.ownerEmail,
        }}
        members={members}
        entitlements={context.entitlements}
        isOwner={workspace.role === "owner"}
        demoMode={!isAuth0Mode()}
        fgaConfigured={isFgaConfigured()}
      />
    </div>
  );
}
