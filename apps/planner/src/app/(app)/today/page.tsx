import { TodayPlanner } from "@/components/today-planner";
import { requireAppContext } from "@/lib/context";

export default async function TodayPage() {
  const context = await requireAppContext();
  const initialDateKey = new Date().toISOString().slice(0, 10);
  const storageScope = `${context.user.id}:${context.workspace?.id ?? "personal"}`;
  return <TodayPlanner initialDateKey={initialDateKey} storageScope={storageScope} />;
}
