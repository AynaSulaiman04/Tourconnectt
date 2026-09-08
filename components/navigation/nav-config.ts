export type NavbarVariant = "public" | "traveler" | "operator" | "admin";

export type NavItem = {
  label: string;
  href: string;
  icon?: string;
  /**
   * Sidebar grouping. Items are rendered in the order the groups first appear,
   * so keep related entries adjacent in the list below.
   */
  section?: string;
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

/**
 * Labels name what a page actually does, not what its route is called.
 * "Home" pointed at /AdminContent (site copy and review moderation) and
 * "Dashboard" sat beside it, which read as two landing pages.
 *
 * The `action` entry is the account-level destination pinned to the foot of the
 * sidebar. It must not also appear in `items` -- it is rendered separately.
 */
export const NAVBAR_CONFIG: Record<NavbarVariant, NavbarConfig> = {
  public: {
    eyebrow: "CONNECTING YOU TO THE REAL CARIBBEAN",
    action: { label: "Log in", href: "/LoginPage?redirect=/TravellerProfile" },
    items: [
      { label: "Experiences", href: "/Experiences" },
      { label: "Concierge", href: "/ConciergeChat" },
      { label: "How it works", href: "/HowItWorks" },
      { label: "Profile", href: "/TravellerProfile" },
    ],
  },
  traveler: {
    eyebrow: "CONNECTING YOU TO THE REAL CARIBBEAN",
    action: { label: "Profile", href: "/TravellerProfile", icon: "person" },
    items: [
      { label: "Experiences", href: "/Experiences", icon: "explore", section: "Plan" },
      { label: "Concierge", href: "/ConciergeChat", icon: "chat", section: "Plan" },
      { label: "My enquiries", href: "/Enquiry", icon: "assignment", section: "Trips" },
      { label: "Inbox", href: "/Messages", icon: "inbox", section: "Trips" },
    ],
  },
  operator: {
    eyebrow: "CONNECTING YOU TO THE REAL CARIBBEAN",
    action: { label: "Settings", href: "/OperatorSettings", icon: "settings" },
    items: [
      { label: "Overview", href: "/OperatorDashboard", icon: "dashboard", section: "Operations" },
      { label: "Listings", href: "/OperatorListings", icon: "list_alt", section: "Operations" },
      { label: "Bookings", href: "/OperatorBookings", icon: "event_available", section: "Operations" },
      { label: "Documents", href: "/OperatorDocuments", icon: "folder_open", section: "Operations" },
      { label: "CRM", href: "/OperatorUserManage", icon: "groups", section: "People" },
      { label: "Messages", href: "/OperatorMessages", icon: "forum", section: "People" },
    ],
  },
  admin: {
    eyebrow: "CONNECTING YOU TO THE REAL CARIBBEAN",
    action: { label: "Settings", href: "/AdminSettings", icon: "settings" },
    items: [
      { label: "Overview", href: "/AdminDashboard", icon: "dashboard", section: "Operations" },
      { label: "Bookings", href: "/AdminBookings", icon: "event_available", section: "Operations" },
      { label: "Listings", href: "/AdminListings", icon: "list_alt", section: "Operations" },
      { label: "CRM", href: "/AdminUsers", icon: "groups", section: "People" },
      { label: "Analytics", href: "/AdminAnalytics", icon: "insights", section: "Platform" },
      { label: "Content", href: "/AdminContent", icon: "article", section: "Platform" },
    ],
  },
};
