import "server-only";

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { buildConciergeContext, type ConciergeContextBundle } from "@/lib/ai/concierge-context";

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
};

function getOpenAIModel() {
  if (process.env.GROQ_API_KEY?.trim()) {
    return process.env.OPENAI_MODEL?.trim() || "openai/gpt-oss-20b";
  }

  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

function getOpenAIClient() {
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  const apiKey = groqApiKey || openAiApiKey;

  if (!apiKey) {
    return null;
  }

  if (groqApiKey) {
    return new OpenAI({
      apiKey: groqApiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }

  return new OpenAI({ apiKey });
}

function buildSystemPrompt(context: ConciergeContextBundle) {
  return [
    "You are TT Connect Concierge, a warm, concise travel assistant for Trinidad and Tobago tourism.",
    "Use only the provided platform context for listings, prices, availability, and knowledge.",
    "Never invent prices, availability, operators, or government advisories.",
    "If a detail is missing, clearly say the operator will confirm it.",
    "Recommend real TT Connect listings when helpful.",
    "Guide users to submit an inquiry if they want to move forward.",
    "Do not mention internal database or implementation details.",
    "Do not route traveler actions to operator or admin pages.",
    "Keep the reply friendly, useful, and not overly long.",
    "",
    context.promptContext,
  ].join("\n");
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
}) {
  const context = await buildConciergeContext({
    query: params.message,
    userId: params.userId,
  });

  const client = getOpenAIClient();
  if (!client) {
    return {
      ok: false,
      configurationError: "Concierge AI is unavailable until OpenAI is configured.",
      recommendations: context.recommendations,
      sources: context.sourceSummaries,
      promptContext: context.promptContext,
      context,
    } satisfies ConciergeReplyResult;
  }

  try {
    const completion = await client.chat.completions.create({
      model: getOpenAIModel(),
      temperature: 0.4,
      max_tokens: 700,
      messages: [
        { role: "system", content: buildSystemPrompt(context) },
        ...toChatMessages(params.historyMessages.slice(-10)),
        { role: "user", content: params.message },
      ],
    });

    const assistantText = completion.choices[0]?.message?.content?.trim();

    if (!assistantText) {
      return {
        ok: false,
        error: "The concierge response came back empty. Please try again.",
        statusCode: 503,
        recommendations: context.recommendations,
        sources: context.sourceSummaries,
        promptContext: context.promptContext,
        context,
      } satisfies ConciergeReplyResult;
    }

    return {
      ok: true,
      assistantText,
      recommendations: context.recommendations,
      sources: context.sourceSummaries,
      promptContext: context.promptContext,
      context,
    } satisfies ConciergeReplyResult;
  } catch (error) {
    console.error("Concierge AI provider error", error);
    const normalized = normalizeOpenAIError(error);

    return {
      ok: false,
      error: normalized.message,
      statusCode: normalized.statusCode,
      recommendations: context.recommendations,
      sources: context.sourceSummaries,
      promptContext: context.promptContext,
      context,
    } satisfies ConciergeReplyResult;
  }
}
