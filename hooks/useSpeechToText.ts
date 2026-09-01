"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type SpeechRecognitionResultList = {
  isFinal: boolean;
  [index: number]: { transcript?: string };
  length: number;
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList[];
};

type SpeechRecognitionFailureEvent = {
  error: string;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionFailureEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getSpeechRecognitionClass() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

// Speech recognition support never changes for the life of the document, so
// there is nothing to subscribe to.
function subscribeToNothing() {
  return () => {};
}

function getSpeechRecognitionSupport() {
  return Boolean(getSpeechRecognitionClass());
}

// The server has no `window`, so it must report "unsupported" and the first
// client render must agree. Reading `window` during render instead makes SSR
// emit a disabled mic while hydration computes an enabled one, which React
// reports as an attribute mismatch and refuses to patch up.
function getServerSpeechRecognitionSupport() {
  return false;
}

export function useSpeechToText() {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onFinalRef = useRef<(text: string) => void>(() => {});

  const isSupported = useSyncExternalStore(
    subscribeToNothing,
    getSpeechRecognitionSupport,
    getServerSpeechRecognitionSupport,
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const startListening = useCallback((onFinal: (text: string) => void) => {
    const SpeechRecognitionClass = getSpeechRecognitionClass();
    if (!SpeechRecognitionClass) {
      setError("Voice search is not supported in this browser.");
      return;
    }

    recognitionRef.current?.abort();

    const recognition = new SpeechRecognitionClass();
    recognition.lang = "en-GB";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    onFinalRef.current = onFinal;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      setInterimTranscript("");
    };

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";

        if (result.isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (interim) {
        setInterimTranscript(interim);
      }

      if (final.trim()) {
        onFinalRef.current(final.trim());
        setInterimTranscript("");
      }
    };

    recognition.onerror = (event) => {
      setError(
        event.error === "not-allowed"
          ? "Microphone permission was denied."
          : "Voice input failed. Please try again.",
      );
      setIsListening(false);
      setInterimTranscript("");
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setError("Voice input could not start. Please try again.");
      setIsListening(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    isSupported,
    isListening,
    interimTranscript,
    error,
    startListening,
    stopListening,
  };
}
