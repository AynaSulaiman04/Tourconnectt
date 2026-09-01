export type NavbarVariant = "public" | "traveler" | "operator" | "admin";

export type NavItem = {
  label: string;
  href: string;
  icon?: string;
};

export type NavbarConfig = {
  eyebrow: string;
  action: {
    label: string;
    href: string;
    icon?: string;
  };
  items: NavItem[];
};

export const NAVBAR_CONFIG: Record<NavbarVariant, NavbarConfig> = {
  public: {
    eyebrow: "CONNECTING YOU TO THE REAL CARIBBEAN",
    action: { label: "Log in", href: "/LoginPage?redirect=/TravellerProfile" },
    items: [
      { label: "Enquiry", href: "/Enquiry" },
      { label: "Concierge", href: "/ConciergeChat" },
      { label: "Profile", href: "/TravellerProfile" },
    ],
  },
  traveler: {
    eyebrow: "CONNECTING YOU TO THE REAL CARIBBEAN",
    action: { label: "Log in", href: "/LoginPage?redirect=/TravellerProfile" },
    items: [
      { label: "Enquiry", href: "/Enquiry" },
      { label: "Concierge", href: "/ConciergeChat" },
      { label: "Profile", href: "/TravellerProfile" },
    ],
  },
  operator: {
    eyebrow: "CONNECTING YOU TO THE REAL CARIBBEAN",
    action: { label: "Settings", href: "/OperatorSettings", icon: "settings" },
    items: [
      { label: "Overview", href: "/OperatorDashboard", icon: "dashboard" },
      { label: "Listings", href: "/OperatorListings", icon: "list_alt" },
      { label: "Bookings", href: "/OperatorBookings", icon: "event_available" },
      { label: "Customers", href: "/OperatorUserManage", icon: "groups" },
      { label: "Messages", href: "/OperatorMessages", icon: "forum" },
      { label: "Documents", href: "/OperatorDocuments", icon: "folder_open" },
    ],
  },
  admin: {
    eyebrow: "CONNECTING YOU TO THE REAL CARIBBEAN",
    action: { label: "Settings", href: "/AdminSettings", icon: "settings" },
    items: [
      { label: "Home", href: "/AdminContent", icon: "home" },
      { label: "Dashboard", href: "/AdminDashboard", icon: "dashboard" },
      { label: "Bookings", href: "/AdminBookings", icon: "event_available" },
      { label: "Listings", href: "/AdminListings", icon: "list_alt" },
      { label: "Users", href: "/AdminUsers", icon: "group" },
      { label: "Analytics", href: "/AdminAnalytics", icon: "insights" },
    ],
  },
};
