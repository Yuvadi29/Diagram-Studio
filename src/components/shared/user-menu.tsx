"use client";
import { useState } from "react";
import Link from "next/link";
import { LogOut, Settings, User } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/sign-out";

export function Avatar({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cn("size-7 rounded-full object-cover", className)} />
  ) : (
    <span className={cn("flex size-7 items-center justify-center rounded-full border border-card-edge text-xs font-semibold text-foreground", className)}>{initials || <User className="size-3.5" />}</span>
  );
}

export function UserMenu({ name, email, avatarUrl, compact }: { name: string; email: string; avatarUrl?: string | null; compact?: boolean }) {
  const [signingOut, setSigningOut] = useState(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-accent" aria-label="Account menu">
        <Avatar name={name} url={avatarUrl} />
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            // Keep the menu mounted until sign-out finishes; it navigates away when done.
            e.preventDefault();
            setSigningOut(true);
            void signOut();
          }}
          disabled={signingOut}
        >
          <LogOut /> {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
