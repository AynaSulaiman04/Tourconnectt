export type ItineraryDay = {
  day: number;
  title: string;
  detail: string;
};

/**
 * The itinerary panel renders these as plain text, so any markdown the model
 * used has to come off here. Previously only the title was cleaned and the
 * detail line shipped literal "**Morning:**" into the UI.
 */
function stripMarkdown(value: string) {
  return value
    .replace(/`{1,3}/g, "")
    .replace(/\*\*|__/g, "")
    .replace(/[*_]/g, "")
    .replace(/^#{1,6}\s*/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractItineraryDraft(content: string): ItineraryDay[] {
  const normalized = content.replace(/\r\n/g, "\n");
  const days: ItineraryDay[] = [];

  const dayBlockPattern = /(?:^|\n)\s*(?:#{1,3}\s*)?(?:day\s*(\d+)|day\s*(\d+)\s*[-:–])[\s:–-]*([^\n]+)?/gi;
  let match: RegExpExecArray | null;

  while ((match = dayBlockPattern.exec(normalized)) !== null) {
    const dayNumber = Number(match[1] ?? match[2]);
    if (!dayNumber || dayNumber > 30) {
      continue;
    }

    const start = match.index + match[0].length;
    const nextDayMatch = normalized.slice(start).search(/\n\s*(?:#{1,3}\s*)?day\s*\d+/i);
    const blockEnd = nextDayMatch >= 0 ? start + nextDayMatch : normalized.length;
    const block = normalized.slice(start, blockEnd).trim();
    const lines = block
      .split("\n")
      .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
      .filter(Boolean);

    days.push({
      day: dayNumber,
      title: stripMarkdown(match[3]?.trim() || lines[0] || `Day ${dayNumber}`),
      detail: stripMarkdown(
        lines.slice(match[3]?.trim() ? 0 : 1).join(" · ") || lines[0] || "",
      ),
    });
  }

  if (days.length > 0) {
    return days.sort((left, right) => left.day - right.day);
  }

  const numberedPattern = /(?:^|\n)\s*(\d+)[.)]\s+([^\n]+)/g;
  while ((match = numberedPattern.exec(normalized)) !== null) {
    const dayNumber = Number(match[1]);
    if (!dayNumber || dayNumber > 14) {
      continue;
    }

    days.push({
      day: dayNumber,
      title: `Day ${dayNumber}`,
      detail: stripMarkdown(match[2]),
    });
  }

  return days.sort((left, right) => left.day - right.day).slice(0, 14);
}
