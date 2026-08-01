import { fail, sourceLocation } from "../diagnostics.js";
import type {
  MarkerBoundary,
  MomentOccurrence,
  NarrativeIR,
  ScriptAtom,
  ScriptSegment,
  ScriptToken,
  SelectionOccurrence,
} from "../model.js";
import { normalizeWord, sha256, stableJson } from "../util.js";

type Marker = {
  id: string;
  kind: "open" | "close" | "moment";
  affinity: "left" | "right";
  length: number;
};

type MutableSegment = {
  id: string;
  index: number;
  atoms: ScriptAtom[];
  tokenStart: number;
  sourceStart: number;
};

const WORD =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]\p{M}*|[\p{L}\p{M}\p{N}]+(?:['’.-][\p{L}\p{M}\p{N}]+)*/gu;
const SEGMENT_OPEN = /^<segment\s+id=(?:"([^"]+)"|'([^']+)')\s*(\/?)>/u;
const SEGMENT_CLOSE = /^<\/segment\s*>/u;
const ROLE_LABEL = /^[\p{L}\p{M}\p{N}_](?:[\p{L}\p{M}\p{N}_. -]{0,30}[\p{L}\p{M}\p{N}_.-])?$/u;
const TEMPORAL_ID = /^[a-z][a-z0-9_-]{0,63}$/u;
const SEGMENT_ID = /^[a-z][a-z0-9_-]{0,63}$/u;

function parseMarker(source: string, offset: number): Marker | undefined {
  const slice = source.slice(offset);
  const markerName = String.raw`[a-z][a-z0-9_-]{0,63}`;
  const match = new RegExp(
    String.raw`^(~)?@(?:(\/)(${markerName})(~)?|(${markerName})(!)?)(?![A-Za-z0-9_-])`,
    "u",
  ).exec(slice);
  if (!match) return undefined;
  const prefixLeft = match[1] === "~";
  const close = match[2] === "/";
  const id = close ? match[3] : match[5];
  const suffixRight = close && match[4] === "~";
  const moment = !close && match[6] === "!";
  if (!id) return undefined;
  return {
    id,
    kind: moment ? "moment" : close ? "close" : "open",
    affinity: prefixLeft || (!close && !moment ? false : false)
      ? "left"
      : suffixRight
        ? "right"
        : close
          ? "left"
          : "right",
    length: match[0].length,
  };
}

function cleanProjection(value: string): string {
  return value
    .replace(/\s+/gu, " ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/([([{])\s+/gu, "$1")
    .replace(/\s+([)\]}])/gu, "$1")
    .trim();
}

function joinProjection(parts: string[]): string {
  return cleanProjection(parts.filter((part) => part.trim()).join(" "));
}

function markerBoundary(
  tokenIndex: number,
  segment: MutableSegment | undefined,
  structuralPosition: number,
): MarkerBoundary {
  return {
    tokenIndex,
    structuralPosition,
    ...(segment ? { segmentId: segment.id } : {}),
  };
}

function segmentAnchorId(segmentId: string, edge: "start" | "end"): string {
  return `segment:${segmentId}:${edge}`;
}

function tokenAnchorId(
  segmentId: string,
  segmentTokenIndex: number,
  edge: "start" | "end",
): string {
  return `segment:${segmentId}:token:${segmentTokenIndex + 1}:${edge}`;
}

export function parseScript(
  file: string,
  scriptSource: string,
  sourceOffset = 0,
  bindings: Record<string, string> = {},
): NarrativeIR {
  scriptSource = scriptSource.replace(/\r\n?/gu, "\n").normalize("NFC");
  const segments: ScriptSegment[] = [];
  const tokens: ScriptToken[] = [];
  const openSelections = new Map<string, Array<{
    affinity: "left" | "right";
    boundary: MarkerBoundary;
    sourceStart: number;
  }>>();
  const selections: Record<string, SelectionOccurrence[]> = {};
  const moments: Record<string, MomentOccurrence[]> = {};
  const captionAtoms: NarrativeIR["captionAtoms"] = [];
  let current: MutableSegment | undefined;
  let offset = 0;
  let structuralPosition = 0;
  let lineStart = true;

  const location = (at: number) => sourceLocation(file, scriptSource, at);

  const findUnescaped = (value: string, character: string, from = 0): number => {
    for (let index = from; index < value.length; index += 1) {
      if (value[index] !== character) continue;
      let slashes = 0;
      for (let before = index - 1; before >= 0 && value[before] === "\\"; before -= 1) {
        slashes += 1;
      }
      if (slashes % 2 === 0) return index;
    }
    return -1;
  };

  const literalPieces = (
    raw: string,
    absoluteStart: number,
    dual = false,
  ): Array<{ value: string; start: number; end: number }> => {
    const pieces: Array<{ value: string; start: number; end: number }> = [];
    let buffer = "";
    let bufferStart = 0;
    const flush = (end: number): void => {
      if (!buffer) {
        bufferStart = end;
        return;
      }
      pieces.push({
        value: buffer,
        start: absoluteStart + bufferStart,
        end: absoluteStart + end,
      });
      buffer = "";
      bufferStart = end;
    };
    for (let index = 0; index < raw.length;) {
      if (raw.startsWith("${", index)) {
        flush(index);
        const close = raw.indexOf("}", index + 2);
        if (close < 0) fail("script_slot_unclosed", "Unclosed Script Slot.", location(absoluteStart + index));
        const id = raw.slice(index + 2, close);
        if (!/^[\p{L}_][\p{L}\p{M}\p{N}_-]{0,63}$/u.test(id)) {
          fail("script_slot_id", `Invalid Script Slot "${id}".`, location(absoluteStart + index));
        }
        const value = bindings[id];
        if (value === undefined) {
          fail("script_slot_unbound", `Script Slot "${id}" is not bound.`, location(absoluteStart + index));
        }
        if (/[\r\n\p{Cc}]/u.test(value)) {
          fail("script_slot_value", `Script Slot "${id}" must be single-line literal text.`);
        }
        pieces.push({
          value,
          start: absoluteStart + index,
          end: absoluteStart + close + 1,
        });
        index = close + 1;
        bufferStart = index;
        continue;
      }
      if (raw[index] === "\\") {
        const known = raw.startsWith("\\${", index)
          ? { value: "${", length: 3 }
          : ["@", "<", "\\", ...(dual ? ["|", ">"] : [])].includes(raw[index + 1] ?? "")
            ? { value: raw[index + 1]!, length: 2 }
            : undefined;
        if (!known) {
          fail(
            "script_unknown_escape",
            `Unknown Script escape "${raw.slice(index, index + 2)}".`,
            location(absoluteStart + index),
          );
        }
        buffer += known.value;
        index += known.length;
        continue;
      }
      buffer += raw[index];
      index += 1;
    }
    flush(raw.length);
    return pieces;
  };

  const literalString = (raw: string, absoluteStart: number, dual = false): string =>
    literalPieces(raw, absoluteStart, dual).map((piece) => piece.value).join("");

  const addMarker = (marker: Marker, at: number): void => {
    const boundary = markerBoundary(tokens.length, current, structuralPosition);
    if (marker.kind === "moment") {
      if (openSelections.has(marker.id) || selections[marker.id]) {
        fail(
          "script_temporal_type_conflict",
          `Temporal name "${marker.id}" cannot be both Selection and Moment.`,
          location(at),
        );
      }
      const list = moments[marker.id] ?? [];
      list.push({
        id: marker.id,
        occurrence: list.length,
        affinity: marker.affinity,
        boundary,
        sourceStart: sourceOffset + at,
      });
      moments[marker.id] = list;
      return;
    }
    if (marker.kind === "open") {
      if (moments[marker.id]) {
        fail(
          "script_temporal_type_conflict",
          `Temporal name "${marker.id}" cannot be both Moment and Selection.`,
          location(at),
        );
      }
      const list = openSelections.get(marker.id) ?? [];
      if (list.length) {
        fail(
          "script_selection_reopened",
          `Selection "${marker.id}" is opened again before it closes.`,
          location(at),
        );
      }
      list.push({
        affinity: marker.affinity,
        boundary,
        sourceStart: sourceOffset + at,
      });
      openSelections.set(marker.id, list);
      return;
    }
    const opens = openSelections.get(marker.id);
    const open = opens?.shift();
    if (!open) {
      fail(
        "script_selection_close_without_open",
        `Selection "${marker.id}" closes without a matching open marker.`,
        location(at),
      );
    }
    const list = selections[marker.id] ?? [];
    list.push({
      id: marker.id,
      occurrence: list.length,
      open,
      close: {
        affinity: marker.affinity,
        boundary,
        sourceStart: sourceOffset + at,
      },
    });
    selections[marker.id] = list;
  };

  const addText = (
    speech: string,
    caption: string,
    start: number,
    end: number,
  ): void => {
    if (!current) {
      if (speech.trim() || caption.trim()) {
        fail(
          "script_text_outside_segment",
          "Natural-language text is only allowed inside <segment>.",
          location(start),
        );
      }
      return;
    }
    const tokenStart = tokens.length;
    WORD.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WORD.exec(speech))) {
      const normalized = normalizeWord(match[0]);
      if (!normalized) continue;
      const index = tokens.length;
      const segmentTokenIndex = index - current.tokenStart;
      tokens.push({
        id: `w${index + 1}`,
        index,
        segmentId: current.id,
        segmentTokenIndex,
        startAnchorId: tokenAnchorId(current.id, segmentTokenIndex, "start"),
        endAnchorId: tokenAnchorId(current.id, segmentTokenIndex, "end"),
        text: match[0],
        normalized,
        sourceStart: sourceOffset + start + match.index,
        sourceEnd: sourceOffset + start + match.index + match[0].length,
      });
    }
    current.atoms.push({
      kind: "text",
      speech,
      caption,
      start: sourceOffset + start,
      end: sourceOffset + end,
      tokenStart,
      tokenEndExclusive: tokens.length,
    });
  };

  const consumeSpeechSide = (
    raw: string,
    absoluteStart: number,
    caption: string,
  ): void => {
    const startToken = tokens.length;
    let partStart = 0;
    let index = 0;
    let emittedCaption = false;
    const addLiteral = (rawPart: string, start: number): void => {
      const pieces = literalPieces(rawPart, start, true);
      for (const piece of pieces) {
        addText(
          piece.value,
          emittedCaption ? "" : caption,
          piece.start,
          piece.end,
        );
        emittedCaption = true;
      }
    };
    while (index < raw.length) {
      if (raw.startsWith("${", index)) {
        const close = raw.indexOf("}", index + 2);
        if (close < 0) fail("script_slot_unclosed", "Unclosed Script Slot.", location(absoluteStart + index));
        index = close + 1;
        continue;
      }
      if (raw[index] === "\\") {
        index += raw.startsWith("\\${", index) ? 3 : 2;
        continue;
      }
      const marker = parseMarker(raw, index);
      if (!marker) {
        if (raw[index] === "@") {
          fail(
            "script_invalid_marker",
            "Unescaped @ must begin a valid Selection or Moment marker.",
            location(absoluteStart + index),
          );
        }
        index += 1;
        continue;
      }
      addLiteral(raw.slice(partStart, index), absoluteStart + partStart);
      addMarker(marker, absoluteStart + index);
      index += marker.length;
      partStart = index;
    }
    addLiteral(raw.slice(partStart), absoluteStart + partStart);
    const endTokenExclusive = tokens.length;
    if (endTokenExclusive > startToken) {
      captionAtoms.push({
        id: `caption-atom-${captionAtoms.length + 1}`,
        display: cleanProjection(caption),
        segmentId: current!.id,
        startToken,
        endTokenExclusive,
        sourceStart: sourceOffset + absoluteStart,
        sourceEnd: sourceOffset + absoluteStart + raw.length,
      });
    }
  };

  while (offset < scriptSource.length) {
    if (scriptSource.startsWith("<!--", offset)) {
      const end = scriptSource.indexOf("-->", offset + 4);
      if (end < 0) fail("script_unclosed_comment", "Unclosed Script comment.", location(offset));
      const comment = scriptSource.slice(offset, end + 3);
      lineStart = comment.endsWith("\n") || lineStart;
      offset = end + 3;
      continue;
    }

    const segmentOpen = SEGMENT_OPEN.exec(scriptSource.slice(offset));
    if (segmentOpen) {
      if (current) {
        fail("script_nested_segment", "Segment elements cannot nest.", location(offset));
      }
      const id = segmentOpen[1] ?? segmentOpen[2];
      if (!id || !SEGMENT_ID.test(id)) {
        fail("script_invalid_segment_id", `Invalid Segment id "${id ?? ""}".`, location(offset));
      }
      if (segments.some((segment) => segment.id === id)) {
        fail("script_duplicate_segment_id", `Duplicate Segment id "${id}".`, location(offset));
      }
      current = {
        id,
        index: segments.length,
        atoms: [],
        tokenStart: tokens.length,
        sourceStart: sourceOffset + offset,
      };
      offset += segmentOpen[0].length;
      lineStart = true;
      if (segmentOpen[3] === "/") {
        segments.push({
          ...current,
          startAnchorId: segmentAnchorId(current.id, "start"),
          endAnchorId: segmentAnchorId(current.id, "end"),
          tokenEnd: tokens.length,
          sourceEnd: sourceOffset + offset,
        });
        current = undefined;
        structuralPosition += 1;
      }
      continue;
    }

    const segmentClose = SEGMENT_CLOSE.exec(scriptSource.slice(offset));
    if (segmentClose) {
      if (!current) {
        fail("script_segment_close_without_open", "Unexpected </segment>.", location(offset));
      }
      offset += segmentClose[0].length;
      segments.push({
        ...current,
        startAnchorId: segmentAnchorId(current.id, "start"),
        endAnchorId: segmentAnchorId(current.id, "end"),
        tokenEnd: tokens.length,
        sourceEnd: sourceOffset + offset,
      });
      current = undefined;
      structuralPosition += 1;
      lineStart = true;
      continue;
    }

    const marker = parseMarker(scriptSource, offset);
    if (marker) {
      if (!TEMPORAL_ID.test(marker.id)) {
        fail("script_invalid_temporal_id", `Invalid temporal id "${marker.id}".`, location(offset));
      }
      addMarker(marker, offset);
      offset += marker.length;
      continue;
    }

    if (scriptSource[offset] === "@") {
      fail(
        "script_invalid_marker",
        "Unescaped @ must begin a valid Selection or Moment marker.",
        location(offset),
      );
    }

    if (scriptSource[offset] === "<" && current) {
      const safeEnd = findUnescaped(scriptSource, ">", offset + 1);
      if (safeEnd < 0) fail("script_unclosed_angle", "Unclosed Script angle construct.", location(offset));
      const inside = scriptSource.slice(offset + 1, safeEnd);
      const pipe = findUnescaped(inside, "|");
      if (pipe >= 0) {
        const display = literalString(inside.slice(0, pipe), offset + 1, true);
        const speech = inside.slice(pipe + 1);
        if (!speech.replace(/~?@\/?[A-Za-z_][A-Za-z0-9_.-]*!?~?/gu, "").trim()) {
          fail("script_dual_speech_empty", "Dual Text speech side must not be empty.", location(offset));
        }
        consumeSpeechSide(speech, offset + 1 + pipe + 1, display);
        offset = safeEnd + 1;
        lineStart = false;
        continue;
      }
      if (lineStart && ROLE_LABEL.test(inside)) {
        const after = scriptSource.slice(safeEnd + 1);
        if (!after.match(/^[^\S\n]*\S/u)) {
          fail(
            "script_role_empty_turn",
            `Role Cue <${inside}> must be followed by spoken content on the same logical line.`,
            location(offset),
          );
        }
        current.atoms.push({
          kind: "role",
          label: inside,
          start: sourceOffset + offset,
          end: sourceOffset + safeEnd + 1,
        });
        offset = safeEnd + 1;
        lineStart = false;
        continue;
      }
      fail(
        "script_unknown_angle_construct",
        `Unknown Script construct <${inside}>.`,
        location(offset),
      );
    }

    const textStart = offset;
    while (offset < scriptSource.length) {
      if (
        scriptSource.startsWith("<!--", offset)
        || scriptSource.startsWith("<segment", offset)
        || scriptSource.startsWith("</segment", offset)
        || parseMarker(scriptSource, offset)
        || scriptSource[offset] === "<"
        || scriptSource[offset] === "@"
      ) break;
      if (scriptSource[offset] === "\\") {
        if (scriptSource.startsWith("\\${", offset)) offset += 3;
        else offset += Math.min(2, scriptSource.length - offset);
        continue;
      }
      offset += 1;
    }
    const raw = scriptSource.slice(textStart, offset);
    for (const piece of literalPieces(raw, textStart)) {
      addText(piece.value, piece.value, piece.start, piece.end);
    }
    const lastNewline = raw.lastIndexOf("\n");
    if (lastNewline >= 0) {
      lineStart = raw.slice(lastNewline + 1).trim() === "";
    } else if (raw.trim()) {
      lineStart = false;
    }
  }

  if (current) {
    fail("script_unclosed_segment", `Segment "${current.id}" is not closed.`);
  }
  const dangling = [...openSelections.entries()].flatMap(([id, opens]) =>
    opens.map((open) => ({ id, open })));
  if (dangling.length) {
    fail(
      "script_selection_unclosed",
      `Selection "${dangling[0]?.id ?? "unknown"}" is not closed.`,
    );
  }
  if (!segments.length) fail("script_segment_cardinality", "Script requires at least one Segment.");

  const speechSegments: string[] = [];
  const captionSegments: string[] = [];
  const dialogueTurns: string[] = [];
  const turns: NarrativeIR["turns"] = [];
  for (const segment of segments) {
    const speechParts: string[] = [];
    const captionParts: string[] = [];
    let activeRole: string | undefined;
    let turnParts: string[] = [];
    let turnTokenStart: number | undefined;
    let turnTokenEndExclusive: number | undefined;
    let turnSourceStart: number | undefined;
    let turnSourceEnd: number | undefined;
    const flushTurn = (): void => {
      const body = joinProjection(turnParts);
      if (body) dialogueTurns.push(activeRole ? `${activeRole}: ${body}` : body);
      if (
        turnTokenStart !== undefined
        && turnTokenEndExclusive !== undefined
        && turnTokenEndExclusive > turnTokenStart
      ) {
        turns.push({
          id: `turn-${turns.length + 1}`,
          segmentId: segment.id,
          ...(activeRole ? { role: activeRole } : {}),
          tokenStart: turnTokenStart,
          tokenEndExclusive: turnTokenEndExclusive,
          sourceStart: turnSourceStart ?? segment.sourceStart,
          sourceEnd: turnSourceEnd ?? segment.sourceEnd,
        });
      }
      turnParts = [];
      turnTokenStart = undefined;
      turnTokenEndExclusive = undefined;
      turnSourceStart = undefined;
      turnSourceEnd = undefined;
    };
    for (const atom of segment.atoms) {
      if (atom.kind === "role") {
        flushTurn();
        activeRole = atom.label;
      } else {
        speechParts.push(atom.speech);
        captionParts.push(atom.caption);
        turnParts.push(atom.speech);
        if (atom.tokenEndExclusive > atom.tokenStart) {
          turnTokenStart ??= atom.tokenStart;
          turnTokenEndExclusive = atom.tokenEndExclusive;
          turnSourceStart ??= atom.start;
          turnSourceEnd = atom.end;
        }
      }
    }
    flushTurn();
    const speech = joinProjection(speechParts);
    const caption = joinProjection(captionParts);
    if (speech) speechSegments.push(speech);
    if (caption) captionSegments.push(caption);
  }

  const semanticAnchors = segments.flatMap((segment) => [
    {
      id: segment.startAnchorId,
      kind: "segment-start" as const,
      segmentId: segment.id,
    },
    ...tokens.slice(segment.tokenStart, segment.tokenEnd).flatMap((token) => [
      {
        id: token.startAnchorId,
        kind: "token-start" as const,
        segmentId: segment.id,
        tokenId: token.id,
        segmentTokenIndex: token.segmentTokenIndex,
      },
      {
        id: token.endAnchorId,
        kind: "token-end" as const,
        segmentId: segment.id,
        tokenId: token.id,
        segmentTokenIndex: token.segmentTokenIndex,
      },
    ]),
    {
      id: segment.endAnchorId,
      kind: "segment-end" as const,
      segmentId: segment.id,
    },
  ]);
  const semanticTokens = tokens.map((token) => ({
    id: token.id,
    segmentId: token.segmentId,
    segmentTokenIndex: token.segmentTokenIndex,
    normalized: token.normalized,
    startAnchorId: token.startAnchorId,
    endAnchorId: token.endAnchorId,
  }));
  const semanticIndexPayload = {
    contract: "svml.semantic-index.v1" as const,
    anchors: semanticAnchors,
    tokens: semanticTokens,
  };

  return {
    segments,
    tokens,
    turns,
    selections,
    moments,
    captionAtoms,
    semanticIndex: {
      ...semanticIndexPayload,
      digest: sha256(stableJson(semanticIndexPayload)),
    },
    projections: {
      dialogue: dialogueTurns.join("\n"),
      speech: speechSegments.join("\n"),
      caption: captionSegments.join("\n"),
    },
  };
}
