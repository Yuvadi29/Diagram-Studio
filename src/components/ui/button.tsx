import * as React from "react";
import { Slot as SlotPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * ChaiUI buttons.
 * - `default` is ChaiUI's "soft" button: the neutral primary (light grey on dark).
 * - `solid` is the white one with asymmetric corners. Use it once per screen, for the main action.
 * - `outline` mirrors those corners and sits beside `solid` or on its own.
 * - `destructive` (red fill) is only for the confirm button of a destructive action.
 * There is no brand-coloured fill on purpose.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors duration-200 outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:ring-[3px] focus-visible:ring-ring/40",
  {
    variants: {
      variant: {
        default: "rounded-md bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
        solid: "btn-asym bg-neutral-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-neutral-200",
        outline: "btn-asym-mirror border border-neutral-200 bg-transparent text-foreground hover:bg-neutral-100 dark:border-white/10 dark:hover:bg-black/90",
        secondary: "rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "rounded-md text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        destructive: "rounded-md bg-red-600 font-semibold text-white hover:bg-red-600/90 dark:bg-red-500 dark:hover:bg-red-500/90",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 gap-1.5 px-3 text-xs",
        lg: "h-10 px-6",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    compoundVariants: [
      { size: "icon", className: "rounded-md" },
      { size: "icon-sm", className: "rounded-md" },
    ],
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? SlotPrimitive.Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
