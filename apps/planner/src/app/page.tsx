import { WelcomePage } from "@/components/welcome-page";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  return <WelcomePage initialMode={params.mode === "signup" ? "signup" : "login"} />;
}
