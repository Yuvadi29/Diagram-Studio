import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full rounded-md border border-input bg-white px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-brand/70 focus-visible:ring-[3px] focus-visible:ring-brand/15 dark:bg-black/30",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
