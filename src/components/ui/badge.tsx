import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** ChaiUI chips: meaning is carried by coloured text and a thin outline, never a filled pill. */
const badgeVariants = cva("inline-flex items-center gap-1 rounded-md border bg-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3", {
  variants: {
    variant: {
      default: "border-brand/40 text-brand",
      secondary: "border-card-edge text-foreground",
      outline: "text-muted-foreground",
      success: "border-success/40 text-success",
      destructive: "border-destructive/40 text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
