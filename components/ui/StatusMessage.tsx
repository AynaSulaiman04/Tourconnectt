import type { ReactNode } from "react";

type StatusMessageTone = "error" | "warning" | "success" | "info" | "loading" | "empty";

type StatusMessageProps = {
  tone: StatusMessageTone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
};

const toneStyles: Record<StatusMessageTone, string> = {
  error: "border-[rgba(186,26,26,0.18)] bg-[rgba(255,218,214,0.56)] text-on-surface-variant",
  warning: "border-[rgba(167,67,31,0.18)] bg-[rgba(243,222,214,0.52)] text-on-surface-variant",
  success: "border-[rgba(180,122,22,0.18)] bg-[rgba(243,225,186,0.34)] text-on-surface-variant",
  info: "border-[rgba(55,45,38,0.1)] bg-[rgba(255,253,251,0.72)] text-on-surface-variant",
  loading: "border-[rgba(55,45,38,0.1)] bg-[rgba(255,253,251,0.72)] text-on-surface-variant",
  empty: "border-dashed border-[rgba(206,197,185,0.32)] bg-[rgba(255,253,251,0.66)] text-on-surface-variant",
};

const toneIcons: Record<StatusMessageTone, string> = {
  error: "error",
  warning: "warning",
  success: "check_circle",
  info: "info",
  loading: "progress_activity",
  empty: "inbox",
};

export function StatusMessage({ tone, title, children, className = "" }: StatusMessageProps) {
  return (
    <div
      className={`flex gap-3 rounded-[1rem] border px-4 py-3 ${toneStyles[tone]} ${className}`.trim()}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <span className="material-symbols-outlined mt-[1px] text-[1.1rem] text-secondary" aria-hidden="true">
        {toneIcons[tone]}
      </span>
      <div className="min-w-0">
        {title ? <div className="font-body-md text-on-surface mb-1">{title}</div> : null}
        <div className="text-sm leading-6">{children}</div>
      </div>
    </div>
  );
}
