import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOptionalCurrentUserProfile } from "@/lib/supabase/profile";
import { submitTravelerReview } from "@/lib/supabase/reviews";

export type ReviewFormState = {
  message: string;
  success: boolean;
  fieldErrors: {
    rating?: string[];
    comment?: string[];
    inquiryId?: string[];
  };
};

export const initialReviewFormState: ReviewFormState = {
  message: "",
  success: false,
  fieldErrors: {},
};

const reviewSchema = z.object({
  inquiryId: z.string().uuid({ error: "Choose a valid inquiry." }),
  rating: z.coerce.number().int().min(1, { error: "Choose a rating." }).max(5, { error: "Choose a rating." }),
  comment: z.string().trim().max(2000, { error: "Keep your review under 2000 characters." }).optional().or(z.literal("")),
});

export async function submitInquiryReviewAction(
  _state: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const profileContext = await getOptionalCurrentUserProfile();

  if (!profileContext?.profile) {
    return {
      ...initialReviewFormState,
      message: "Please sign in to leave a review.",
      fieldErrors: {},
    };
  }

  if (profileContext.profile.role !== "traveler") {
    return {
      ...initialReviewFormState,
      message: "Reviews can only be submitted from a traveler account.",
      fieldErrors: {},
    };
  }

  const validated = reviewSchema.safeParse({
    inquiryId: formData.get("inquiry_id"),
    rating: formData.get("rating"),
    comment: formData.get("comment"),
  });

  if (!validated.success) {
    return {
      ...initialReviewFormState,
      message: "Please review the highlighted fields.",
      fieldErrors: validated.error.flatten().fieldErrors,
    };
  }

  try {
    await submitTravelerReview({
      travelerId: profileContext.profile.id,
      travelerEmail: profileContext.profile.email,
      inquiryId: validated.data.inquiryId,
      rating: validated.data.rating,
      comment: validated.data.comment || null,
    });

    revalidatePath("/TravellerProfile");
    revalidatePath("/ConfirmationPage");

    return {
      message: "Your review has been saved.",
      success: true,
      fieldErrors: {},
    };
  } catch (error) {
    console.error("Unable to save traveler review", {
      inquiryId: validated.data.inquiryId,
      travelerId: profileContext.profile.id,
      error,
    });

    return {
      ...initialReviewFormState,
      message: "We could not save your review. Please try again.",
      fieldErrors: {},
    };
  }
}
