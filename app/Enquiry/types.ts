export type InquiryFormState = {
  message: string;
  success: boolean;
  fieldErrors: {
    listingId?: string[];
    travelerName?: string[];
    travelerEmail?: string[];
    travelerPhone?: string[];
    preferredStartDate?: string[];
    preferredEndDate?: string[];
    availability?: string[];
    notes?: string[];
  };
};

export const initialInquiryFormState: InquiryFormState = {
  message: "",
  success: false,
  fieldErrors: {},
};
