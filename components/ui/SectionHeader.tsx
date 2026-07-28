import type { ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  align?: "left" | "center";
  level?: 1 | 2;
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  align = "left",
  level = 2,
}: SectionHeaderProps) {
  const Heading = level === 1 ? "h1" : "h2";

  return (
    <div className={`flex flex-col gap-3 ${align === "center" ? "items-center text-center" : ""}`}>
      {eyebrow ? <div className="label-caps text-secondary">{eyebrow}</div> : null}
      <div className={`flex w-full flex-col gap-4 ${align === "center" ? "items-center" : "md:flex-row md:items-end md:justify-between"}`}>
        <div className="space-y-2">
          <Heading className="section-title text-on-background">{title}</Heading>
          {description ? <p className="section-copy max-w-3xl">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
