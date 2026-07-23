"use client";

import { useState } from "react";

type CopyButtonProps = {
  value: string;
  className?: string;
  children: string;
};

export function CopyButton({ value, className = "", children }: CopyButtonProps) {
  const [label, setLabel] = useState(children);

  return (
    <button
      className={`btn-outline btn-sm ${className}`.trim()}
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setLabel("Copied");
        window.setTimeout(() => setLabel(children), 1200);
      }}
    >
      {label}
    </button>
  );
}
