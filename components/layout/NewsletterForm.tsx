"use client";

import { useState, type FormEvent } from "react";

export function NewsletterForm() {
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("The mailing list is not open yet. Contact us and we will add you when it launches.");
  }

  return (
    <form className="site-newsletter-wrap" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="newsletter-email">
        Email
      </label>
      <div className="site-newsletter">
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
      <p className="site-newsletter-message" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
