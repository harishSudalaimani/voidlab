import { AppShell } from "@/components/app-shell";
import { TodayPlanner } from "@/components/today-planner";

export default function HomePage() {
  return (
    <AppShell
      user={{ name: "Planner preview", email: "Local preview", picture: null }}
      workspaces={[]}
      currentWorkspaceId={null}
      authMode="demo"
      preview
    >
      <TodayPlanner
        initialDateKey="2026-12-01"
        storageScope="local-preview"
      />
    </AppShell>
  );
}
