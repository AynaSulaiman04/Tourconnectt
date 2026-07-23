export type NavbarVariant = "public" | "traveler" | "operator" | "admin";

export type NavItem = {
  label: string;
  href: string;
};

export type NavbarConfig = {
  eyebrow: string;
  action: {
    label: string;
    href: string;
  };
  items: NavItem[];
};

export const NAVBAR_CONFIG: Record<NavbarVariant, NavbarConfig> = {
  public: {
    eyebrow: "CONNECTING YOU TO THE REAL CARIBBEAN",
    action: { label: "Log in", href: "/LoginPage?redirect=/TravellerProfile" },
    items: [
      { label: "Inquiry", href: "/Inquiry" },
      { label: "Concierge", href: "/ConciergeChat" },
      { label: "Profile", href: "/TravellerProfile" },
    ],
  },
  traveler: {
    eyebrow: "CONNECTING YOU TO THE REAL CARIBBEAN",
    action: { label: "Log in", href: "/LoginPage?redirect=/TravellerProfile" },
    items: [
      { label: "Inquiry", href: "/Inquiry" },
      { label: "Concierge", href: "/ConciergeChat" },
      { label: "Profile", href: "/TravellerProfile" },
    ],
  },
  operator: {
    eyebrow: "CONNECTING YOU TO THE REAL CARIBBEAN",
    action: { label: "Settings", href: "/OperatorSettings" },
    items: [
      { label: "Overview", href: "/OperatorDashboard" },
      { label: "Listings", href: "/OperatorListings" },
      { label: "Bookings", href: "/OperatorBookings" },
      { label: "Customers", href: "/OperatorUserManage" },
      { label: "Messages", href: "/OperatorMessages" },
      { label: "Documents", href: "/OperatorDocuments" },
    ],
  },
  admin: {
    eyebrow: "CONNECTING YOU TO THE REAL CARIBBEAN",
    action: { label: "Settings", href: "/AdminSettings" },
    items: [
      { label: "Dashboard", href: "/AdminDashboard" },
      { label: "Bookings", href: "/AdminBookings" },
      { label: "Listings", href: "/AdminListings" },
      { label: "Users", href: "/AdminUsers" },
      { label: "Analytics", href: "/AdminAnalytics" },
      { label: "Content", href: "/AdminContent" },
    ],
  },
};
