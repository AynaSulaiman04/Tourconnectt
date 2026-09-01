"use client";

import { useState, type FormEvent } from "react";

export function NewsletterForm() {
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // There is no newsletter store yet. Until one exists, point people at a
    // channel that does reach the team rather than implying a subscription.
    setMessage("The mailing list is not open yet. Contact us and we will add you when it launches.");
  }

  return (
    <form className="lp-newsletter-wrap" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="newsletter-email">
        Email
      </label>
      <div className="lp-newsletter">
        <input
          id="newsletter-email"
          name="email"
          placeholder="Enter your email"
          type="email"
          autoComplete="email"
          required
        />
        <button type="submit" aria-label="Subscribe">
          <span className="material-symbols-outlined" aria-hidden="true">
            arrow_forward
          </span>
        </button>
      </div>
      <p className="lp-newsletter-message" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
