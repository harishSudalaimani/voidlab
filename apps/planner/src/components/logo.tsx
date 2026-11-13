import Link from "next/link";
import { Compass } from "lucide-react";

export function Logo({
  size = "md",
  withWordmark = true,
}: {
  size?: "sm" | "md";
  withWordmark?: boolean;
}) {
  const box = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const icon = size === "sm" ? 16 : 18;
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`${box} relative grid place-items-center rounded-xl bg-gradient-to-br from-accent-400 to-violet-500 text-ink-950 shadow-[0_0_30px_-8px_rgba(52,211,153,0.7)]`}
      >
        <Compass size={icon} strokeWidth={2.4} />
      </span>
      {withWordmark && (
        <span className="text-[15px] font-bold tracking-tight text-mist-100">
          Northstar
        </span>
      )}
    </span>
  );
}

export function LogoLink() {
  return (
    <Link href="/" className="inline-flex" aria-label="Northstar home">
      <Logo />
    </Link>
  );
}
