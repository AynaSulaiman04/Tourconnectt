import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  className?: string;
  href?: string;
  linkClassName?: string;
  priority?: boolean;
  variant?: "header" | "footer";
};

export function BrandLogo({
  className = "",
  href = "/",
  linkClassName = "",
  priority = false,
  variant = "header",
}: BrandLogoProps) {
  const imageClassName = variant === "footer" ? "footer-brand-logo" : "brand-logo-image";
  const image = (
    <Image
      alt="Tour ConnecTT"
      className={`${imageClassName} ${className}`.trim()}
      height={variant === "footer" ? 180 : 72}
      priority={priority}
      src="/branding/tourconnecttt-logo.png"
      width={variant === "footer" ? 620 : 300}
    />
  );

  if (!href) {
    return image;
  }

  return (
    <Link
      aria-label="Tour ConnecTT home"
      className={`brand-logo-link ${linkClassName}`.trim()}
      href={href}
    >
      {image}
    </Link>
  );
}
