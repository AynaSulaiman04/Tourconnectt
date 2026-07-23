export type ProfileFormState = {
  message: string;
  success: boolean;
  profileImageUrl: string | null;
  fieldErrors: {
    fullName?: string[];
    preferredInquiryArea?: string[];
    profileImage?: string[];
    phoneNumber?: string[];
    allergies?: string[];
    dietaryRestrictions?: string[];
    mobilityRequirements?: string[];
    medicalNotes?: string[];
    canWalk15Minutes?: string[];
    defaultPickupLocation?: string[];
    preferredPickupTime?: string[];
  };
};

export const initialProfileFormState: ProfileFormState = {
  message: "",
  success: false,
  profileImageUrl: null,
  fieldErrors: {},
};

export type TravelSummaryFormState = {
  message: string;
  success: boolean;
  fieldErrors: {
    countryName?: string[];
  };
};

export const initialTravelSummaryFormState: TravelSummaryFormState = {
  message: "",
  success: false,
  fieldErrors: {},
};
