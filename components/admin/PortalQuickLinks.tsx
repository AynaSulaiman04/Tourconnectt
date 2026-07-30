import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";

type PortalQuickLinksProps = {
  variant: "admin" | "operator";
};

const ADMIN_LINKS = [
  { href: "/AdminSettings", label: "Settings", icon: "settings" },
  { href: "/AdminContent", label: "Home & content", icon: "home" },
  { href: "/AdminListings", label: "Listings", icon: "travel_explore" },
  { href: "/AdminBookings", label: "Bookings", icon: "calendar_month" },
] as const;

const OPERATOR_LINKS = [
  { href: "/OperatorSettings", label: "Settings", icon: "settings" },
  { href: "/OperatorListings", label: "Listings", icon: "travel_explore" },
  { href: "/OperatorBookings", label: "Bookings", icon: "calendar_month" },
  { href: "/OperatorMessages", label: "Messages", icon: "forum" },
] as const;

export function PortalQuickLinks({ variant }: PortalQuickLinksProps) {
  const links = variant === "admin" ? ADMIN_LINKS : OPERATOR_LINKS;

  return (
    <GlassPanel className="p-4">
      <div className="label-caps text-secondary mb-3">Quick access</div>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Button key={link.href} href={link.href} variant="outline" className="btn-sm gap-2">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              {link.icon}
            </span>
            {link.label}
          </Button>
        ))}
      </div>
    </GlassPanel>
  );
}
