import { parseTemporalDuration, type TemporalDuration, type TemporalInstantExpression } from "@hypit/temporal";

function negate(value: TemporalDuration): TemporalDuration {
  return value.unit === "seconds"
    ? { ...value, numerator: -value.numerator }
    : { ...value, value: -value.value };
}

/** Parse the restricted absolute Point expression owned by Timeline Author. */
export function parseTimelineInstantExpression(value: string, label: string): TemporalInstantExpression {
  const trimmed = value.trim();
  const aliases = [["start", "timeline.start"], ["end", "timeline.end"],
    ["timeline.start", "timeline.start"], ["timeline.end", "timeline.end"]] as const;
  for (const [spelling, ref] of aliases) {
    if (trimmed === spelling) return { ref };
    const escaped = spelling.replace(".", "\\.");
    const match = new RegExp(`^${escaped}\\s*([+-])\\s*(.+)$`, "u").exec(trimmed);
    if (match !== null) {
      const offset = parseTemporalDuration(match[2]!, `${label} offset`);
      return { ref, offset: match[1] === "-" ? negate(offset) : offset };
    }
  }
  return { ref: "absolute", at: parseTemporalDuration(trimmed, label) };
}
