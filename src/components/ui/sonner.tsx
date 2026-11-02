"use client";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="system"
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast: "!bg-popover !text-popover-foreground !border-card-edge !shadow-none !font-sans",
          description: "!text-muted-foreground",
        },
      }}
    />
  );
}
