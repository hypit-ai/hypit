import { fail } from "./diagnostics.js";
import type { NarrativeIR, SourceDocument } from "./model.js";
import { parseScript } from "./script/parse.js";
import { parseDocumentSource } from "./source/parse-document.js";
import { stableJson } from "./util.js";

function semanticNarrative(narrative: NarrativeIR): unknown {
  return {
    segments: narrative.segments.map((segment) => ({
      id: segment.id,
      tokenStart: segment.tokenStart,
      tokenEnd: segment.tokenEnd,
      atoms: segment.atoms.map((atom) => atom.kind === "role"
        ? { kind: "role", label: atom.label }
        : {
            kind: "text",
            speech: atom.speech.replace(/\s+/gu, " ").trim(),
            caption: atom.caption.replace(/\s+/gu, " ").trim(),
          }),
    })),
    tokens: narrative.tokens.map((token) => ({
      segmentId: token.segmentId,
      text: token.text,
      normalized: token.normalized,
    })),
    selections: Object.fromEntries(Object.entries(narrative.selections).map(([id, occurrences]) => [
      id,
      occurrences.map((occurrence) => ({
        occurrence: occurrence.occurrence,
        open: {
          affinity: occurrence.open.affinity,
          boundary: occurrence.open.boundary,
        },
        close: {
          affinity: occurrence.close.affinity,
          boundary: occurrence.close.boundary,
        },
      })),
    ])),
    moments: Object.fromEntries(Object.entries(narrative.moments).map(([id, occurrences]) => [
      id,
      occurrences.map((occurrence) => ({
        occurrence: occurrence.occurrence,
        affinity: occurrence.affinity,
        boundary: occurrence.boundary,
      })),
    ])),
    captionAtoms: narrative.captionAtoms.map((atom) => ({
      display: atom.display,
      segmentId: atom.segmentId,
      startWord: atom.startWord,
      endWordExclusive: atom.endWordExclusive,
    })),
    projections: narrative.projections,
  };
}

function formatScriptBody(source: string): string {
  const output: string[] = [];
  let insideSegment = false;
  let continuationIndent = 6;
  const pushBlank = (): void => {
    if (output.length && output.at(-1) !== "") output.push("");
  };
  for (const raw of source.replace(/\r\n?/gu, "\n").normalize("NFC").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const opens = /^<segment\b[^>]*>$/u.test(line);
    const selfClosing = /^<segment\b[^>]*\/>$/u.test(line);
    const closes = /^<\/segment\s*>$/u.test(line);
    if (
      (!opens && line.includes("<segment"))
      || (!closes && line.includes("</segment"))
    ) {
      fail(
        "format_script_structural_line",
        "Canonical formatting requires Segment tags to be separate from spoken content.",
      );
    }
    if (opens) {
      if (insideSegment) fail("format_script_nested_segment", "Segment elements cannot nest.");
      pushBlank();
      output.push(`    ${line}`);
      insideSegment = !selfClosing;
      continuationIndent = 6;
      if (selfClosing) pushBlank();
      continue;
    }
    if (closes) {
      if (!insideSegment) {
        fail("format_script_close_without_open", "Unexpected </segment> while formatting.");
      }
      output.push(`    ${line}`);
      insideSegment = false;
      continuationIndent = 6;
      pushBlank();
      continue;
    }
    if (insideSegment) {
      const role = /^(<[\p{L}\p{M}\p{N}_. -]+>)\s+/u.exec(line);
      if (role) continuationIndent = 6 + role[0].length;
      output.push(`${" ".repeat(role ? 6 : continuationIndent)}${line}`);
    } else {
      output.push(`    ${line}`);
    }
  }
  if (insideSegment) fail("format_script_unclosed_segment", "Unclosed Segment while formatting.");
  while (output.at(-1) === "") output.pop();
  return `\n${output.join("\n")}\n  `;
}

export function formatDocumentScript(
  document: SourceDocument,
  narrative: NarrativeIR,
  bindings: Record<string, string>,
): string {
  const body = formatScriptBody(document.scriptSource);
  const formatted = [
    document.source.slice(0, document.scriptOffset),
    body,
    document.source.slice(document.scriptOffset + document.scriptSource.length),
  ].join("");
  const reparsedDocument = parseDocumentSource(document.file, formatted);
  const reparsedNarrative = parseScript(
    document.file,
    reparsedDocument.scriptSource,
    reparsedDocument.scriptOffset,
    bindings,
  );
  if (stableJson(semanticNarrative(narrative)) !== stableJson(semanticNarrative(reparsedNarrative))) {
    fail(
      "format_semantic_change",
      "Formatter refused output because Script semantic IR changed.",
    );
  }
  return formatted;
}
