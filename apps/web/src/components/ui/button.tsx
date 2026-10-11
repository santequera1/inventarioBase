import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-base font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-primary-button hover:bg-[#1a1a1a] active:bg-black",
        secondary: "bg-card text-foreground border border-input shadow-button hover:bg-surface-hover active:bg-surface-selected",
        ghost: "text-foreground hover:bg-black/5 active:bg-black/10",
        plain: "text-[#005BD3] hover:underline underline-offset-2 h-auto px-0 font-medium",
        destructive: "bg-destructive text-destructive-foreground shadow-primary-button hover:bg-[#a8220a]",
        "destructive-secondary": "bg-card text-destructive border border-input shadow-button hover:bg-tone-critical-bg/60",
      },
      size: {
        md: "h-9 px-3",
        sm: "h-8 px-2.5 text-sm",
        lg: "h-10 px-4",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Comp>
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
