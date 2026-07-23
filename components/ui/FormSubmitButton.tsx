"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type FormSubmitButtonProps = {
  variant?: "primary" | "outline" | "ghost" | "danger";
  className?: string;
  children: ReactNode;
  pendingLabel?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "disabled" | "children" | "className">;

export function FormSubmitButton({
  variant = "outline",
  className = "",
  children,
  pendingLabel,
  ...props
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();
  const variantClass =
    variant === "primary"
      ? "btn-primary"
      : variant === "ghost"
        ? "btn-ghost"
        : variant === "danger"
          ? "btn-danger"
          : "btn-outline";
  const classes = `${variantClass} ${className}`.trim();

  return (
    <button
      className={classes}
      disabled={pending}
      aria-busy={pending}
      type="submit"
      {...props}
    >
      {pending ? pendingLabel ?? children : children}
    </button>
  );
}
