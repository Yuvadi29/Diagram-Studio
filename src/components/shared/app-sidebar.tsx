"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Clock, FolderOpen, LayoutDashboard, Menu, Plus, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { NewDiagramDialog } from "@/components/dashboard/new-diagram-dialog";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" },
  { href: "/projects", label: "My diagrams", icon: FolderOpen, match: (p: string, v: string | null) => p === "/projects" && v !== "recent" },
  { href: "/projects?view=recent", label: "Recent projects", icon: Clock, match: (p: string, v: string | null) => p === "/projects" && v === "recent" },
  { href: "/settings", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

export function AppSidebar({ user }: { user: { name: string; email: string; avatarUrl?: string | null } }) {
  const pathname = usePathname();
  const view = useSearchParams().get("view");
  const [open, setOpen] = useState(false);

  const content = (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center justify-between px-2 pt-1">
        <Logo href="/dashboard" className="text-sm" />
        <ThemeToggle />
      </div>
      <NewDiagramDialog>
        <Button variant="outline" className="w-full justify-start" onClick={() => setOpen(false)}>
          <Plus /> New diagram
        </Button>
      </NewDiagramDialog>
      <nav className="grid gap-0.5">
        {NAV.map((item) => {
          const active = item.match(pathname, view);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active ? "bg-accent/70 font-medium text-foreground dark:bg-white/[0.06]" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <item.icon className={cn("size-4", active && "text-brand")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t pt-3">
        <UserMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-card-edge bg-sidebar md:block">{content}</aside>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo href="/dashboard" className="text-sm" />
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu />
        </Button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-card-edge bg-sidebar">
            <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" onClick={() => setOpen(false)} aria-label="Close menu">
              <X />
            </Button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
