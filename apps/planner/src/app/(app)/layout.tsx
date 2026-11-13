import { AppShell } from "@/components/app-shell";
import { requireAppContext } from "@/lib/context";
import { isAuth0Mode } from "@/lib/env";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireAppContext();

  return (
    <AppShell
      user={{
        name: context.user.name,
        email: context.user.email,
        picture: context.user.picture,
      }}
      workspaces={context.workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        role: workspace.role,
        isPersonal: workspace.isPersonal,
        ownerEmail: workspace.ownerEmail,
      }))}
      currentWorkspaceId={context.workspace?.id ?? null}
      pro={context.entitlements.pro}
      authMode={isAuth0Mode() ? "auth0" : "demo"}
    >
      {children}
    </AppShell>
  );
}
