import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { NAV } from "./nav";

export function Sidebar({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const { can } = useAuth();
  return (
    <nav className={cn("flex h-full flex-col gap-0.5 px-3 py-3", className)} aria-label="Principal">
      {NAV.filter((n) => !n.permission || can(n.permission)).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2 text-base font-medium transition-colors [&_svg]:h-[18px] [&_svg]:w-[18px]",
              isActive ? "bg-card text-foreground shadow-nav-active [&_svg]:text-foreground" : "text-[#4a4a4a] hover:bg-black/[0.04] hover:text-foreground [&_svg]:text-[#616161]",
            )
          }
        >
          <item.icon strokeWidth={1.75} />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
