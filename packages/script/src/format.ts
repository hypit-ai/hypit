import { ScriptSyntaxError } from "./error.js";
import { narrativeValue } from "./narrative.js";
import { parseScript } from "./parser.js";
import type { ParsedSegment } from "./types.js";

function compact(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function formatSegment(source: string, segment: ParsedSegment): string[] {
  const { id, selfClosing, contentRange, atoms } = segment;
  if (selfClosing) return [`<${id}/>`];
  const lines: string[] = [`<${id}>`];
  const turns: string[] = [];
  let chunkStart = contentRange.start;
  for (const atom of atoms) {
    if (atom.kind !== "role") continue;
    const before = compact(source.slice(chunkStart, atom.range.start));
    if (before) turns.push(before);
    chunkStart = atom.range.start;
  }
  const tail = compact(source.slice(chunkStart, contentRange.end));
  if (tail) turns.push(tail);
  lines.push(...turns.map((turn) => `  ${turn}`));
  lines.push(`</${id}>`);
  return lines;
}

function formatOutside(raw: string): string[] {
  return raw
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Formats the body stored in a standalone Script file. */
export function formatScript(sourceName: string, source: string): string {
  const parsed = parseScript(sourceName, source);
  const output: string[] = [];
  let cursor = 0;
  for (const segment of parsed.segments) {
    const start = segment.range.start;
    const end = segment.range.end;
    const outside = formatOutside(source.slice(cursor, start));
    if (outside.length) {
      if (output.length) output.push("");
      output.push(...outside, "");
    } else if (output.length) {
      output.push("");
    }
    output.push(...formatSegment(source, segment));
    cursor = end;
  }
  const tail = formatOutside(source.slice(cursor));
  if (tail.length) output.push("", ...tail);
  while (output.at(-1) === "") output.pop();
  const formatted = `${output.join("\n")}\n`;
  const reparsed = parseScript(sourceName, formatted);
  if (JSON.stringify(narrativeValue(parsed, "comparison")) !== JSON.stringify(narrativeValue(reparsed, "comparison"))) {
    throw new ScriptSyntaxError(
      "SCRIPT_FORMAT_SEMANTICS",
      "Formatter refused to change Script semantics.",
      sourceName,
    );
  }
  return formatted;
}
