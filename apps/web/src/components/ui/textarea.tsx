import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(({ className, invalid, ...props }, ref) => (
  <textarea
    className={cn(
      "min-h-[80px] w-full rounded-md border bg-card px-3 py-2 text-base placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:bg-muted",
      invalid ? "border-destructive" : "border-input hover:border-[#8a8a8a] focus-visible:border-ring",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";
export { Textarea };
