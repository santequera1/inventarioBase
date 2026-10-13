import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  invalid?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, prefix, suffix, invalid, ...props }, ref) => {
  const base = "h-10 sm:h-9 w-full rounded-md border bg-card text-base text-foreground placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";
  const border = invalid ? "border-destructive focus-visible:ring-destructive" : "border-input hover:border-[#8a8a8a] focus-visible:border-ring";
  if (prefix || suffix) {
    return (
      <div className={cn("flex items-center gap-2 px-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1", base, border, className)}>
        {prefix ? <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{prefix}</span> : null}
        <input type={type} className={cn("h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/80", type === "number" && "tabular text-right")} ref={ref} {...props} />
        {suffix ? <span className="shrink-0 text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
    );
  }
  return <input type={type} className={cn(base, border, "px-3", type === "number" && "tabular text-right", className)} ref={ref} {...props} />;
});
Input.displayName = "Input";

export { Input };
