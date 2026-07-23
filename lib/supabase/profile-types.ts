export type TravelerProfile = {
  id: string;
  email: string;
  full_name: string;
  preferred_inquiry_area: "desert" | "coastal" | "arctic" | null;
  profile_image_url: string | null;
  avatar_base64?: string | null;
  role: "traveler" | "operator" | "admin";
  is_active: boolean;
  status_reason: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TravelerCountry = {
  id: string;
  user_id: string;
  country_name: string;
  created_at: string;
};
