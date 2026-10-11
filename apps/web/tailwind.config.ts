import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem" },
    extend: {
      fontFamily: { sans: ['"Inter Variable"', "Inter", "ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"] },
      fontSize: {
        xs: ["12px", "16px"],
        sm: ["13px", "20px"],
        base: ["14px", "20px"],
        md: ["16px", "24px"],
        lg: ["20px", "28px"],
        xl: ["24px", "32px"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        surface: { hover: "hsl(var(--surface-hover))", selected: "hsl(var(--surface-selected))" },
        tone: {
          "success-bg": "hsl(var(--tone-success-bg))",
          "success-fg": "hsl(var(--tone-success-fg))",
          "warning-bg": "hsl(var(--tone-warning-bg))",
          "warning-fg": "hsl(var(--tone-warning-fg))",
          "critical-bg": "hsl(var(--tone-critical-bg))",
          "critical-fg": "hsl(var(--tone-critical-fg))",
          "info-bg": "hsl(var(--tone-info-bg))",
          "info-fg": "hsl(var(--tone-info-fg))",
          "neutral-bg": "hsl(var(--tone-neutral-bg))",
          "neutral-fg": "hsl(var(--tone-neutral-fg))",
        },
      },
      borderRadius: { lg: "12px", md: "8px", sm: "6px" },
      boxShadow: {
        card: "0 1px 0 0 rgba(26,26,26,0.07), 0 0 0 1px rgba(0,0,0,0.0)",
        "nav-active": "0 1px 2px rgba(0,0,0,0.08)",
        popover: "0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)",
        button: "0 1px 0 0 rgba(0,0,0,0.05)",
        "primary-button": "inset 0 1px 0 0 rgba(255,255,255,0.12), 0 1px 0 0 rgba(0,0,0,0.2)",
      },
      spacing: { 13: "52px", 15: "60px" },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: { "accordion-down": "accordion-down 0.2s ease-out", "accordion-up": "accordion-up 0.2s ease-out" },
    },
  },
  plugins: [animate],
} satisfies Config;
