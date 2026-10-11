import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium leading-4 whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-tone-neutral-bg text-tone-neutral-fg",
      success: "bg-tone-success-bg text-tone-success-fg",
      warning: "bg-tone-warning-bg text-tone-warning-fg",
      critical: "bg-tone-critical-bg text-tone-critical-fg",
      info: "bg-tone-info-bg text-tone-info-fg",
      outline: "border border-border bg-card text-muted-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
export { Badge, badgeVariants };
