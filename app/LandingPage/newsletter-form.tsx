"use client";

import { useState, type FormEvent } from "react";

export function NewsletterForm() {
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Newsletter signup is coming soon.");
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
