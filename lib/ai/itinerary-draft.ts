export type ItineraryDay = {
  day: number;
  title: string;
  detail: string;
};

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
      title: (match[3]?.trim() || lines[0] || `Day ${dayNumber}`).replace(/[*_]/g, ""),
      detail: lines.slice(match[3]?.trim() ? 0 : 1).join(" · ") || lines[0] || "",
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
      detail: match[2].replace(/[*_]/g, "").trim(),
    });
  }

  return days.sort((left, right) => left.day - right.day).slice(0, 14);
}
