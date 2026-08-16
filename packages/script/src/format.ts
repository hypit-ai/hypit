import { canonicalStringify } from "@narratage/protocol";

import { ScriptSyntaxError } from "./error.js";
import { narrativeValue } from "./narrative.js";
import { parseScript } from "./parser.js";

const ROLE = /^[\p{L}\p{M}\p{N}_](?:[\p{L}\p{M}\p{N}_. -]{0,30}[\p{L}\p{M}\p{N}_.-])?$/u;

function compact(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function formatSegment(raw: string, id: string, selfClosing: boolean): string[] {
  if (selfClosing) return [`<${id}/>`];
  const openEnd = raw.indexOf(">") + 1;
  const closeStart = raw.lastIndexOf(`</${id}>`);
  const body = raw.slice(openEnd, closeStart);
  const lines: string[] = [`<${id}>`];
  const turns: string[] = [];
  let chunkStart = 0;
  let cursor = 0;
  while (cursor < body.length) {
    if (body[cursor] !== "<" || body.startsWith("<!--", cursor)) {
      cursor += 1;
      continue;
    }
    const end = body.indexOf(">", cursor + 1);
    if (end < 0) break;
    const inside = body.slice(cursor + 1, end);
    if (!inside.includes("|") && ROLE.test(inside)) {
      const before = compact(body.slice(chunkStart, cursor));
      if (before) turns.push(before);
      chunkStart = cursor;
    }
    cursor = end + 1;
  }
  const tail = compact(body.slice(chunkStart));
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

/** Formats a Script body, not the outer `<script>` element. */
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
    output.push(...formatSegment(source.slice(start, end), segment.id, segment.selfClosing));
    cursor = end;
  }
  const tail = formatOutside(source.slice(cursor));
  if (tail.length) output.push("", ...tail);
  while (output.at(-1) === "") output.pop();
  const formatted = `${output.join("\n")}\n`;
  const reparsed = parseScript(sourceName, formatted);
  if (canonicalStringify(narrativeValue(parsed)) !== canonicalStringify(narrativeValue(reparsed))) {
    throw new ScriptSyntaxError(
      "SCRIPT_FORMAT_SEMANTICS",
      "Formatter refused to change Script semantics.",
      sourceName,
    );
  }
  return formatted;
}
