"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/shared/theme-toggle";
import { cn } from "@/lib/utils";

export function AppearanceForm() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="grid grid-cols-2 gap-3 sm:max-w-sm" role="radiogroup" aria-label="Theme">
      {(["dark", "light"] as const).map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={theme === t}
          onClick={() => setTheme(t)}
          className={cn("flex items-center gap-2 rounded-lg border p-3 text-sm capitalize", theme === t ? "border-primary bg-primary/5" : "hover:border-muted-foreground/40")}
        >
          {t === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />} {t}
        </button>
      ))}
    </div>
  );
}
