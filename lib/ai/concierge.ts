import "server-only";

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { buildConciergeContext, type ConciergeContextBundle } from "@/lib/ai/concierge-context";
import { extractItineraryDraft, type ItineraryDay } from "@/lib/ai/itinerary-draft";

export type ConciergeHistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ConciergeReplyResult = {
  ok: boolean;
  assistantText?: string;
  configurationError?: string;
  error?: string;
  statusCode?: number;
  recommendations?: ConciergeContextBundle["recommendations"];
  sources?: ConciergeContextBundle["sourceSummaries"];
  promptContext?: string;
  context?: ConciergeContextBundle;
  itineraryDraft?: ItineraryDay[];
};

type ConciergeProvider = {
  name: "openai" | "groq";
  apiKey: string;
  baseURL?: string;
  model: string;
  maxTokens: number;
};

/**
 * Ordered candidates. Both keys are usually configured and either can be dead
 * for reasons the other is not — an exhausted OpenAI credit balance, a revoked
 * Groq key — so the caller tries them in turn rather than failing on the first.
 *
 * Groq leads by default: it needs no prepaid balance, and with the token budget
 * and formatting rules below it produces the same itinerary shape. Set
 * CONCIERGE_AI_PROVIDER=openai to lead with OpenAI instead.
 */
function resolveConciergeProviders(): ConciergeProvider[] {
  const requested = process.env.CONCIERGE_AI_PROVIDER?.trim().toLowerCase();
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  const modelOverride = process.env.OPENAI_MODEL?.trim();

  const openai: ConciergeProvider | null = openAiApiKey
    ? {
        name: "openai",
        apiKey: openAiApiKey,
        model: modelOverride || "gpt-4o-mini",
        maxTokens: 2400,
      }
    : null;

  const groq: ConciergeProvider | null = groqApiKey
    ? {
        name: "groq",
        apiKey: groqApiKey,
        baseURL: "https://api.groq.com/openai/v1",
        model: modelOverride || "openai/gpt-oss-120b",
        // Every Groq chat model is a reasoning model. The hidden reasoning pass
        // is charged against this budget before any visible text is produced,
        // so it has to be far larger than the reply itself. At the old 900 the
        // itinerary stopped mid-sentence.
        maxTokens: 6000,
      }
    : null;

  const candidates = requested === "openai" ? [openai, groq] : [groq, openai];

  return candidates.filter((candidate): candidate is ConciergeProvider => candidate !== null);
}

/** A key or balance problem: worth trying the other provider. */
function isProviderCredentialFailure(error: unknown) {
  const status = typeof (error as { status?: number } | null)?.status === "number"
    ? (error as { status: number }).status
    : null;
  const message = (error instanceof Error ? error.message : "").toLowerCase();

  return (
    status === 401 ||
    status === 402 ||
    status === 403 ||
    status === 429 ||
    message.includes("insufficient_quota") ||
    message.includes("credit balance") ||
    message.includes("no credits") ||
    message.includes("quota") ||
    message.includes("api key")
  );
}

function createConciergeClient(provider: ConciergeProvider) {
  return new OpenAI(
    provider.baseURL ? { apiKey: provider.apiKey, baseURL: provider.baseURL } : { apiKey: provider.apiKey },
  );
}

function buildSystemPrompt(context: ConciergeContextBundle) {
  return [
    "You are TT Connect Concierge, a warm travel consultant for Trinidad and Tobago tourism.",
    "Use a natural ChatGPT-style conversation: one thread, no forms, no booking-form tone.",
    "From a single conversation, understand flights, accommodation, attractions, transportation, and daily schedules when the traveller mentions them.",
    "When the traveller refines the trip, update the itinerary in your reply rather than starting from scratch.",
    "Use only the provided platform context for listings, prices, availability, and knowledge.",
    "Never invent prices, availability, operators, or government advisories.",
    "If a detail is missing, clearly say the operator will confirm it.",
    "Recommend real TT Connect listings when helpful.",
    "Guide users to submit an enquiry if they want to move forward.",
    "Use British English spelling (enquiry, traveller, personalise, centre).",
    "Do not mention internal database or implementation details.",
    "Do not route traveller actions to operator or admin pages.",
    "When planning a trip, include a clear day-by-day draft itinerary with timing, transport, stays, and attractions where known.",
    "Format each day as its own heading on its own line, exactly like '### Day 1: Arrival and Pigeon Point', then plain sentences or '-' bullets beneath it.",
    "Never use markdown tables or pipe characters for layout. The chat renders plain text, headings and bullets only, and the itinerary panel reads the 'Day N' headings.",
    "Keep the whole reply under 400 words so it always finishes rather than being cut off.",
    "Call out destination, duration, travellers, interests, and budget when they are known.",
    "",
    context.promptContext,
  ].join("\n");
}

/**
 * The chat surface renders plain text, headings and bullets — not tables. The
 * prompt forbids them, but models reach for tables for itineraries anyway, and
 * a raw table shows up as a wall of pipe characters and also hides the
 * "Day N" headings the itinerary parser needs. So flatten any that slip
 * through into one readable line per row.
 */
function normalizeAssistantText(raw: string) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // A markdown horizontal rule has nothing to render in the chat bubble and
    // otherwise shows up as a literal "---".
    if (/^([-*_])\1{2,}$/.test(trimmed.replace(/\s+/g, ""))) {
      continue;
    }

    // A table separator row such as |---|:--:|---|
    if (trimmed.includes("|") && /^[\s:|-]+$/.test(trimmed) && trimmed.includes("-")) {
      continue;
    }

    // Any line carrying two or more pipes is a table row. Matching on the pipe
    // count rather than requiring a leading and trailing pipe catches the rows
    // models emit with a missing outer delimiter.
    if ((trimmed.match(/\|/g) ?? []).length >= 2) {
      const cells = trimmed
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim().replace(/\*\*/g, ""))
        .filter(Boolean);

      if (!cells.length) {
        continue;
      }

      // A row whose only content is a day marker becomes a real heading, so the
      // itinerary parser can see "Day N" at the start of a line.
      const dayMatch = cells.length === 1 ? cells[0].match(/^day\s*(\d+)\s*[-–:]?\s*(.*)$/i) : null;

      if (dayMatch) {
        output.push(`### Day ${dayMatch[1]}${dayMatch[2] ? `: ${dayMatch[2]}` : ""}`);
        continue;
      }

      output.push(`- ${cells.join(" — ")}`);
      continue;
    }

    output.push(line);
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function toChatMessages(historyMessages: ConciergeHistoryMessage[]): ChatCompletionMessageParam[] {
  return historyMessages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function normalizeOpenAIError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : "The concierge response could not be generated.";
  const message = rawMessage.trim() || "The concierge response could not be generated.";
  const normalized = message.toLowerCase();
  const status = typeof (error as { status?: number } | null)?.status === "number" ? (error as { status: number }).status : null;

  if (normalized.includes("quota") || normalized.includes("rate limit") || status === 429) {
    return {
      message: "Concierge AI is unavailable right now. Please try again later.",
      statusCode: 503,
    };
  }

  if (normalized.includes("authentication") || normalized.includes("api key") || status === 401 || status === 403) {
    return {
      message: "Concierge AI is unavailable until OpenAI is configured.",
      statusCode: 503,
    };
  }

  return {
    message: "Concierge AI could not respond right now. Please try again later.",
    statusCode: status && status >= 500 ? status : 503,
  };
}

export async function generateConciergeReply(params: {
  message: string;
  userId: string | null;
  historyMessages: ConciergeHistoryMessage[];
}): Promise<ConciergeReplyResult> {
  const conversationMessages = [
    ...params.historyMessages.map((entry) => ({ role: entry.role, content: entry.content })),
    { role: "user", content: params.message },
  ];

  const context = await buildConciergeContext({
    query: params.message,
    userId: params.userId,
    conversationMessages,
  });

  const providers = resolveConciergeProviders();
  if (!providers.length) {
    return {
      ok: false,
      configurationError: "Concierge AI is unavailable until OpenAI is configured.",
      recommendations: context.recommendations,
      sources: context.sourceSummaries,
      promptContext: context.promptContext,
      context,
    } satisfies ConciergeReplyResult;
  }

  const contextResult = {
    recommendations: context.recommendations,
    sources: context.sourceSummaries,
    promptContext: context.promptContext,
    context,
  };
  let lastError: unknown = null;

  for (const [index, provider] of providers.entries()) {
    const isLastProvider = index === providers.length - 1;

    try {
      const completion = await createConciergeClient(provider).chat.completions.create({
        model: provider.model,
        temperature: 0.4,
        max_tokens: provider.maxTokens,
        messages: [
          { role: "system", content: buildSystemPrompt(context) },
          ...toChatMessages(params.historyMessages.slice(-10)),
          { role: "user", content: params.message },
        ],
      });

      const choice = completion.choices[0];

      if (choice?.finish_reason === "length") {
        // Logged rather than silently shipping a reply that stops mid-sentence.
        console.error("Concierge reply hit the token ceiling", {
          provider: provider.name,
          model: provider.model,
          maxTokens: provider.maxTokens,
        });
      }

      const assistantText = normalizeAssistantText(choice?.message?.content ?? "");

      if (!assistantText) {
        if (!isLastProvider) {
          console.error("Concierge reply was empty, trying the next provider", {
            provider: provider.name,
            model: provider.model,
          });
          continue;
        }

        return {
          ok: false,
          error: "The concierge response came back empty. Please try again.",
          statusCode: 503,
          ...contextResult,
        } satisfies ConciergeReplyResult;
      }

      return {
        ok: true,
        assistantText,
        itineraryDraft: extractItineraryDraft(assistantText),
        ...contextResult,
      } satisfies ConciergeReplyResult;
    } catch (error) {
      lastError = error;
      console.error("Concierge AI provider error", {
        provider: provider.name,
        model: provider.model,
        error: error instanceof Error ? error.message : error,
      });

      // A dead key or an exhausted balance on one provider says nothing about
      // the other, so fall through and try it.
      if (!isLastProvider && isProviderCredentialFailure(error)) {
        continue;
      }

      break;
    }
  }

  const normalized = normalizeOpenAIError(lastError);

  return {
    ok: false,
    error: normalized.message,
    statusCode: normalized.statusCode,
    ...contextResult,
  } satisfies ConciergeReplyResult;
}
