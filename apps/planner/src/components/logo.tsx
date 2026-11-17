import Link from "next/link";

export function Logo({
  size = "md",
  withWordmark = true,
}: {
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
}) {
  const box = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-14 w-14" : "h-9 w-9";
  const icon = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-12 w-12" : "h-8 w-8";
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`${box} relative grid place-items-center`}
      >
        <svg className={icon} viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path d="M15.3 19.7C12.6 14.9 8.7 5 11.1 3.8c3.1-1.5 7.4 7 9.2 14.1M32.7 19.7C35.4 14.9 39.3 5 36.9 3.8c-3.1-1.5-7.4 7-9.2 14.1" fill="#9b603f" stroke="#573d2a" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M13.8 14.7c-1.6-3.5-3.2-7.4-2.1-8 1.3-.7 3.9 4.1 5.4 7.8M34.2 14.7c1.6-3.5 3.2-7.4 2.1-8-1.3-.7-3.9 4.1-5.4 7.8" fill="#e7a17a" />
          <path d="M14.4 16.1c3.9-4.6 15.3-4.6 19.2 0 4.8 5.6 4.2 14.8-.4 20.1-4.4 5.1-13.9 5.1-18.3 0-4.6-5.3-5.2-14.5-.5-20.1Z" fill="#b9784d" stroke="#573d2a" strokeWidth="1.8" />
          <path d="M15.5 29.1c1.5-4 5-6.6 8.5-6.6s7 2.6 8.5 6.6c1.5 3.9-.6 7.5-4.4 8.7-2.5.8-5.7.8-8.2 0-3.8-1.2-5.9-4.8-4.4-8.7Z" fill="#f2d9b7" />
          <ellipse cx="19.5" cy="22.8" rx="1.6" ry="2" fill="#2a211b" />
          <ellipse cx="28.5" cy="22.8" rx="1.6" ry="2" fill="#2a211b" />
          <circle cx="20" cy="22.2" r=".45" fill="white" />
          <circle cx="29" cy="22.2" r=".45" fill="white" />
          <ellipse cx="20.4" cy="30.6" rx="1.4" ry="1.8" fill="#573d2a" />
          <ellipse cx="27.6" cy="30.6" rx="1.4" ry="1.8" fill="#573d2a" />
          <path d="M20.5 35.2c2.2 1.7 4.8 1.9 7 0" stroke="#573d2a" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M22.2 35.1c-1.3 3.4-.4 7.9 2.1 9.4 2.6 1.6 5.7-.7 5.2-4.1l-.7-5.2c-1.9.8-4.5.8-6.6-.1Z" fill="#f26b5b" stroke="#733e38" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M26.1 41.1v2.4" stroke="#b94640" strokeWidth="1" strokeLinecap="round" />
        </svg>
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
