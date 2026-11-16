import Link from "next/link";
import { NotebookPen } from "lucide-react";

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
        className={`${box} relative grid place-items-center rounded-xl bg-gradient-to-br from-rose-300 via-orange-300 to-yellow-200 text-[#281224] shadow-[0_0_30px_-8px_rgba(255,111,145,0.7)]`}
      >
        <NotebookPen size={icon} strokeWidth={2.6} />
      </span>
      {withWordmark && (
        <span className="text-[15px] font-bold tracking-tight text-mist-100">
          Kiroku
        </span>
      )}
    </span>
  );
}

export function LogoLink() {
  return (
    <Link href="/" className="inline-flex" aria-label="Kiroku home">
      <Logo />
    </Link>
  );
}
