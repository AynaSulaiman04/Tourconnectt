import type { TravelerProfile } from "./profile-types";

export function getRoleDashboardRoute(role: TravelerProfile["role"] | string | null | undefined) {
  switch (role) {
    case "admin":
      return "/AdminDashboard";
    case "operator":
      return "/OperatorDashboard";
    case "traveler":
    default:
      return "/TravellerProfile";
  }
}
