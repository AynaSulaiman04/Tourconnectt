import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type CommonProps = {
  variant?: "primary" | "outline" | "ghost" | "danger";
  className?: string;
  children: ReactNode;
};

type ButtonAsButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: never };
type ButtonAsLinkProps = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function Button(props: ButtonAsButtonProps | ButtonAsLinkProps) {
  const { variant = "outline", className = "", children } = props;
  const variantClass =
    variant === "primary"
      ? "btn-primary"
      : variant === "ghost"
        ? "btn-ghost"
        : variant === "danger"
          ? "btn-danger"
          : "btn-outline";
  const classes = `${variantClass} ${className}`.trim();

  if ("href" in props) {
    const { href, variant: _variant, className: _className, ...rest } = props as ButtonAsLinkProps;
    void _variant;
    void _className;
    return (
      <Link className={classes} href={href} {...(rest as Record<string, unknown>)}>
        {children}
      </Link>
    );
  }

  const { href: _href, variant: _variant, className: _className, ...rest } = props as ButtonAsButtonProps;
  void _href;
  void _variant;
  void _className;
  return (
    <button className={classes} {...(rest as Record<string, unknown>)}>
      {children}
    </button>
  );
}
