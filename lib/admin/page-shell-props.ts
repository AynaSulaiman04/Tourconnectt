type AdminShellProfile = {
  id: string;
  full_name: string;
  profile_image_url: string | null;
};

export function getAdminPageShellProps(profile: AdminShellProfile) {
  return {
    variant: "admin" as const,
    authResolved: true,
    travelerProfile: {
      id: profile.id,
      full_name: profile.full_name,
      profile_image_url: profile.profile_image_url,
      role: "admin" as const,
    },
  };
}
