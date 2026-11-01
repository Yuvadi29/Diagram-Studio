import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-card" />
      <rect x="5" y="8" width="9" height="7" rx="2" fill="none" stroke="var(--primary)" strokeWidth="2" />
      <rect x="18" y="17" width="9" height="7" rx="2" fill="var(--primary)" />
      <path d="M14 11.5h4.5v5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span>Diagram Studio</span>
    </Link>
  );
}
