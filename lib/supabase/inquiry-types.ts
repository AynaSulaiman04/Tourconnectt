export type TourListing = {
  id: string;
  title: string;
  location: string;
  country: string;
  duration: string;
  summary: string;
  image_url: string | null;
  price: string | null;
  operator_id: string | null;
  operator_name: string;
  featured: boolean;
  is_active: boolean;
  status?: "draft" | "under_review" | "live" | "rejected" | null;
  created_at: string;
  updated_at: string;
};

export type TravelerInquiry = {
  id: string;
  user_id: string | null;
  listing_id: string | null;
  payment_amount?: string | null;
  traveler_name: string;
  traveler_email: string;
  traveler_phone: string | null;
  destination: string;
  destination_country: string;
  operator_name: string;
  operator_id: string | null;
  preferred_start_date: string | null;
  preferred_end_date: string | null;
  availability: "morning" | "afternoon" | "evening" | "flexible";
  notes: string | null;
  status: "submitted" | "reviewed" | "confirmed" | "closed";
  confirmation_email_sent_at?: string | null;
  operator_notification_email_sent_at?: string | null;
  reminder_email_sent_at?: string | null;
  pre_tour_email_sent_at?: string | null;
  review_request_email_sent_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type InquiryConfirmation = TravelerInquiry & {
  listing: TourListing | null;
  operator_email?: string | null;
  operator_phone?: string | null;
  review_id?: string | null;
  has_review?: boolean;
  can_review?: boolean;
  payment?: WiPayPaymentSummary | null;
};

export type WiPayPaymentSummary = {
  id: string;
  inquiry_id: string;
  provider: "wipay";
  order_id: string;
  transaction_id: string | null;
  status: "pending" | "initiated" | "paid" | "completed" | "success" | "failed" | "error" | "cancelled" | "refunded";
  amount: string;
  currency: string;
  country_code: string;
  checkout_url: string | null;
  response_payload: Record<string, unknown> | null;
  webhook_payload: Record<string, unknown> | null;
  paid_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
};
