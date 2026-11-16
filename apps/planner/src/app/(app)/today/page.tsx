import { TodayPlanner } from "@/components/today-planner";
import { requireAppContext } from "@/lib/context";

export default async function TodayPage() {
  const context = await requireAppContext();
  const initialDateKey = "2027-01-01";
  const storageScope = `${context.user.id}:${context.workspace?.id ?? "personal"}`;
  return <TodayPlanner initialDateKey={initialDateKey} storageScope={storageScope} />;
}
