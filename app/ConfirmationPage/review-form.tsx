"use client";

import { useActionState } from "react";
import type { ReviewFormState } from "./actions";

type ReviewFormProps = {
  action: (state: ReviewFormState, formData: FormData) => Promise<ReviewFormState>;
  inquiryId: string;
  defaultOpen?: boolean;
};

const ratingOptions = [
  { value: "5", label: "5 - Excellent" },
  { value: "4", label: "4 - Very good" },
  { value: "3", label: "3 - Good" },
  { value: "2", label: "2 - Fair" },
  { value: "1", label: "1 - Needs work" },
];

export function ReviewForm({ action, inquiryId, defaultOpen = false }: ReviewFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    message: "",
    success: false,
    fieldErrors: {},
  } satisfies ReviewFormState);

  return (
    <form className="review-form" action={formAction}>
      <input name="inquiry_id" type="hidden" value={inquiryId} />

      <div className="review-field">
        <label htmlFor="rating">Rating</label>
        <select
          id="rating"
          name="rating"
          defaultValue={defaultOpen ? "5" : ""}
          aria-invalid={Boolean(state.fieldErrors.rating?.length)}
          aria-describedby={state.fieldErrors.rating?.length ? "rating_error" : undefined}
          required
        >
          <option value="" disabled>
            Select a rating
          </option>
          {ratingOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {state.fieldErrors.rating?.length ? (
          <p className="review-field-error" id="rating_error" role="alert">
            {state.fieldErrors.rating[0]}
          </p>
        ) : null}
      </div>

      <div className="review-field">
        <label htmlFor="comment">Comment</label>
        <textarea
          id="comment"
          name="comment"
          placeholder="Tell us what stood out about the experience."
          rows={5}
          aria-invalid={Boolean(state.fieldErrors.comment?.length)}
          aria-describedby={state.fieldErrors.comment?.length ? "comment_error" : undefined}
        />
        {state.fieldErrors.comment?.length ? (
          <p className="review-field-error" id="comment_error" role="alert">
            {state.fieldErrors.comment[0]}
          </p>
        ) : null}
      </div>

      <div className="review-actions">
        <button className="button primary" disabled={pending} type="submit">
          {pending ? "Saving review" : "Submit review"}
        </button>
      </div>

      <p className={`review-status ${state.success ? "success" : "error"}`} aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
