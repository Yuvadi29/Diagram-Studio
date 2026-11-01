"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function useTheme() {
  const [theme, setThemeState] = useState<"dark" | "light">("dark");
  useEffect(() => {
    setThemeState(document.documentElement.classList.contains("light") ? "light" : "dark");
  }, []);
  const setTheme = (t: "dark" | "light") => {
    const c = document.documentElement.classList;
    c.toggle("light", t === "light");
    c.toggle("dark", t === "dark");
    try {
      localStorage.setItem("ds-theme", t);
    } catch {
      /* ignore */
    }
    setThemeState(t);
    window.dispatchEvent(new CustomEvent("ds-theme", { detail: t }));
  };
  return { theme, setTheme };
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
