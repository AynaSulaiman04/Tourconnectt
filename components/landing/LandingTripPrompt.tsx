"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useSpeechToText } from "@/hooks/useSpeechToText";

const EXAMPLE_PROMPT =
  "I'm visiting Trinidad for 5 days with my wife and two children. We love beaches, local food, nature, and we'd like a day trip to Tobago.";

export function LandingTripPrompt() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const { isSupported, isListening, interimTranscript, error, startListening, stopListening } = useSpeechToText();

  const value = isListening && interimTranscript ? interimTranscript : prompt;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    router.push(`/ConciergeChat?prompt=${encodeURIComponent(trimmed)}`);
  }

  function handleVoiceInput() {
    if (isListening) {
      stopListening();
      return;
    }

    startListening((transcript) => {
      setPrompt(transcript);
    });
  }

  return (
    <form className="lp-trip-prompt" onSubmit={handleSubmit}>
      <label className="lp-trip-prompt-label" htmlFor="landing-trip-prompt">
        Describe your trip in your own words
      </label>
      <textarea
        id="landing-trip-prompt"
        className="lp-trip-prompt-input"
        name="prompt"
        rows={4}
        value={value}
        placeholder={EXAMPLE_PROMPT}
        onChange={(event) => setPrompt(event.target.value)}
        disabled={isListening}
      />
      {error ? <p className="lp-trip-prompt-error">{error}</p> : null}
      <div className="lp-trip-prompt-actions">
        <button
          className={`lp-trip-prompt-mic${isListening ? " is-listening" : ""}`}
          type="button"
          aria-label={isListening ? "Stop voice input" : "Speak your trip request"}
          aria-pressed={isListening}
          disabled={!isSupported}
          onClick={handleVoiceInput}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {isListening ? "mic_off" : "mic"}
          </span>
        </button>
        <Button type="submit" variant="outline" className="lp-trip-prompt-submit btn-sm" disabled={!value.trim()}>
          Plan my trip
        </Button>
        <Link className="lp-trip-prompt-link" href="/Enquiry">
          Use detailed enquiry form
        </Link>
      </div>
      <p className="lp-trip-prompt-helper">
        Describe your ideal holiday in plain English. Concierge understands flights, hotels, attractions,
        transport, and schedules from one conversation — then builds an itinerary you refine in chat.
      </p>
    </form>
  );
}
