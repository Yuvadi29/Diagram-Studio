"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">{error.message.includes("Supabase is not configured") || error.message.includes("database isn't set up")
          ? error.message
          : "An unexpected error occurred. Your saved work is safe."}</p>
      <Button onClick={reset} className="mt-2">
        Try again
      </Button>
    </div>
  );
}
