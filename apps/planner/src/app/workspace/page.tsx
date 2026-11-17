import { AppShell } from "@/components/app-shell";
import { TodayPlanner } from "@/components/today-planner";

export default function PreviewWorkspacePage() {
  return (
    <AppShell
      user={{ name: "Planner preview", email: "Local preview", picture: null }}
      workspaces={[]}
      currentWorkspaceId={null}
      authMode="demo"
      preview
    >
      <TodayPlanner initialDateKey="2027-01-01" storageScope="local-preview" />
    </AppShell>
  );
}
