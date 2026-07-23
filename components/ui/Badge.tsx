import type { ReactNode } from "react";

type BadgeProps = {
  children: ReactNode;
  tone?: "default" | "soft" | "accent";
  className?: string;
};

export function Badge({ children, tone = "default", className = "" }: BadgeProps) {
  const toneClass =
    tone === "accent"
      ? "bg-secondary/10 text-secondary border-secondary/10"
      : tone === "soft"
        ? "bg-surface-container-low text-on-surface-variant border-outline-variant/20"
        : "bg-surface-container-lowest/70 text-on-surface-variant border-outline-variant/20";

  return <span className={`page-badge ${toneClass} ${className}`.trim()}>{children}</span>;
}

