
import { ScriptSyntaxError } from "./error.js";
import {
  cleanProjection,
  displayWordSurfaces,
  joinProjection,
  lexicalUnits,
  lexicalEditRanges,
  splitLeadingClosingPunctuation,
} from "./lexical.js";
import type {
  CaptionWordAttribute,
  Affinity,
  MarkerBoundary,
  ParsedAtom,
  ParsedCaptionRegion,
  ParsedMoment,
  ParsedNarrative,
  ParsedSegment,
  ParsedSelection,
  ParsedToken,
  ParsedTurn,
  SemanticAnchor,
} from "./types.js";

type Marker = {
  readonly id: string;
  readonly kind: "open" | "close" | "moment";
  readonly affinity: Affinity;
  readonly length: number;
};

type MutableSegment = {
  readonly id: string;
  readonly index: number;
  readonly atoms: ParsedAtom[];
  readonly tokenStart: number;
  readonly sourceStart: number;
  readonly contentStart: number;
  lexicalRun: string;
  readonly lexicalMarkers: Array<{ readonly position: number; readonly offset: number }>;
};

const SEGMENT_ID = /^[a-z][a-z0-9_-]{0,63}$/u;
const TEMPORAL_ID = /^[a-z][a-z0-9_-]{0,63}$/u;
const ROLE_LABEL = /^[\p{L}\p{M}\p{N}_](?:[\p{L}\p{M}\p{N}_. -]{0,30}[\p{L}\p{M}\p{N}_.-])?$/u;
const RESERVED_SEGMENT_IDS = new Set(["script"]);
const ATTRIBUTE_NAME = /^[a-z][a-z0-9_-]{0,63}$/u;
const ATTRIBUTE_VALUE = /^[A-Za-z0-9_.:-]+$/u;

/** A marker's structural position before its affinity picks one anchor. */
type RawMarkerBoundary = Omit<MarkerBoundary, "anchorId">;
type RawEdge<T> = Omit<T, "boundary"> & { readonly boundary: RawMarkerBoundary };
type RawSelection = Omit<ParsedSelection, "startAnchorId" | "endAnchorId" | "open" | "close"> & {
  readonly open: RawEdge<ParsedSelection["open"]>;
  readonly close: RawEdge<ParsedSelection["close"]>;
};
type RawMoment = Omit<ParsedMoment, "anchorId" | "boundary"> & { readonly boundary: RawMarkerBoundary };

function normalizeWord(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
}

function parseMarker(source: string, offset: number): Marker | undefined {
  const markerName = String.raw`[a-z][a-z0-9_-]{0,63}`;
  const rest = source.slice(offset);
  const closeRight = new RegExp(String.raw`^@\/(${markerName})~`, "u").exec(rest);
  if (closeRight) {
    return { id: closeRight[1]!, kind: "close", affinity: "right", length: closeRight[0].length };
  }
  const closeLeft = new RegExp(String.raw`^@\/(${markerName})(?![A-Za-z0-9_-])`, "u").exec(rest);
  if (closeLeft) {
    return { id: closeLeft[1]!, kind: "close", affinity: "left", length: closeLeft[0].length };
  }
  const moment = new RegExp(String.raw`^(~)?@(${markerName})!`, "u").exec(rest);
  if (moment) {
    return {
      id: moment[2]!,
      kind: "moment",
      affinity: moment[1] === "~" ? "left" : "right",
      length: moment[0].length,
    };
  }
  const open = new RegExp(String.raw`^(~)?@(${markerName})(?![A-Za-z0-9_-])`, "u").exec(rest);
  if (!open) return undefined;
  return {
    id: open[2]!,
    kind: "open",
    affinity: open[1] === "~" ? "left" : "right",
    length: open[0].length,
  };
}

function segmentAnchorId(segmentId: string, edge: "start" | "end"): string {
  return `segment:${segmentId}:${edge}`;
}

function tokenId(segmentId: string, segmentTokenIndex: number): string {
  return `segment:${segmentId}:token:${segmentTokenIndex + 1}`;
}

function tokenAnchorId(segmentId: string, segmentTokenIndex: number, edge: "start" | "end"): string {
  return `${tokenId(segmentId, segmentTokenIndex)}:${edge}`;
}

function findUnescaped(value: string, character: string, from = 0): number {
  for (let index = from; index < value.length; index += 1) {
    if (value[index] !== character) continue;
    let slashes = 0;
    for (let before = index - 1; before >= 0 && value[before] === "\\"; before -= 1) slashes += 1;
    if (slashes % 2 === 0) return index;
  }
  return -1;
}

type ParsedAttributeBlock = {
  readonly attributes: readonly CaptionWordAttribute[];
  readonly length: number;
};

function parseAttributeValue(raw: string): string | number | boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(raw)) return Number(raw);
  return raw;
}

export function parseScript(
  sourceName: string,
  input: string,
  sourceOffset = 0,
): ParsedNarrative {
  // Source ranges are a public inverse used by Studio and diagnostics. Parse
  // the exact UTF-16 text so CRLF and decomposed Unicode never shift an edit.
  const source = input;
  const fail = (code: string, message: string, offset?: number): never => {
    throw new ScriptSyntaxError(code, message, sourceName, offset === undefined ? undefined : sourceOffset + offset);
  };

  const segments: ParsedSegment[] = [];
  const tokens: ParsedToken[] = [];
  const captionRegions: ParsedCaptionRegion[] = [];
  const selections = new Map<string, RawSelection>();
  const moments = new Map<string, RawMoment>();
  const captionBreaks: Array<{ readonly tokenIndex: number; readonly range: { readonly start: number; readonly end: number } }> = [];
  const openSelections = new Map<string, {
    readonly affinity: Affinity;
    readonly boundary: RawMarkerBoundary;
    readonly start: number;
    readonly end: number;
  }>();
  let current: MutableSegment | undefined;
  let offset = 0;
  let structuralPosition = 0;

  const boundary = (): RawMarkerBoundary => ({
    tokenIndex: tokens.length,
    structuralPosition,
    ...(current ? { segmentId: current.id } : {}),
  });

  const finishLexicalRun = (): void => {
    if (!current) return;
    for (const match of lexicalUnits(current.lexicalRun)) {
      const start = match.index;
      const end = start + match.text.length;
      const split = current.lexicalMarkers.find((marker) => start < marker.position && marker.position < end);
      if (split) {
        fail(
          "SCRIPT_MARKER_TOKEN_BOUNDARY",
          "A Selection or Moment marker cannot split a speech token.",
          split.offset,
        );
      }
    }
    current.lexicalRun = "";
    current.lexicalMarkers.length = 0;
  };

  const addMarker = (marker: Marker, start: number): void => {
    if (!TEMPORAL_ID.test(marker.id)) fail("SCRIPT_TEMPORAL_ID", `Invalid temporal id "${marker.id}".`, start);
    if (current) current.lexicalMarkers.push({ position: current.lexicalRun.length, offset: start });
    if (marker.kind === "moment") {
      if (openSelections.has(marker.id) || selections.has(marker.id)) {
        fail("SCRIPT_TEMPORAL_TYPE", `Temporal name "${marker.id}" cannot be both Selection and Moment.`, start);
      }
      if (moments.has(marker.id)) {
        fail("SCRIPT_MOMENT_DUPLICATE", `Moment "${marker.id}" is declared more than once.`, start);
      }
      moments.set(marker.id, {
        id: marker.id,
        affinity: marker.affinity,
        boundary: boundary(),
        range: { start: sourceOffset + start, end: sourceOffset + start + marker.length },
      });
      return;
    }
    if (marker.kind === "open") {
      if (moments.has(marker.id)) {
        fail("SCRIPT_TEMPORAL_TYPE", `Temporal name "${marker.id}" cannot be both Selection and Moment.`, start);
      }
      if (openSelections.has(marker.id)) {
        fail("SCRIPT_SELECTION_REOPENED", `Selection "${marker.id}" is reopened before it closes.`, start);
      }
      if (selections.has(marker.id)) {
        fail("SCRIPT_SELECTION_DUPLICATE", `Selection "${marker.id}" is declared more than once.`, start);
      }
      openSelections.set(marker.id, {
        affinity: marker.affinity,
        boundary: boundary(),
        start: sourceOffset + start,
        end: sourceOffset + start + marker.length,
      });
      return;
    }
    const open = openSelections.get(marker.id)
      ?? fail("SCRIPT_SELECTION_CLOSE", `Selection "${marker.id}" closes without an open.`, start);
    openSelections.delete(marker.id);
    selections.set(marker.id, {
      id: marker.id,
      open: {
        affinity: open.affinity,
        boundary: open.boundary,
        range: { start: open.start, end: open.end },
      },
      close: {
        affinity: marker.affinity,
        boundary: boundary(),
        range: { start: sourceOffset + start, end: sourceOffset + start + marker.length },
      },
    });
  };

  const literalPieces = (
    raw: string,
    absoluteStart: number,
    dual = false,
  ): Array<{ readonly value: string; readonly start: number; readonly end: number }> => {
    const pieces: Array<{ value: string; start: number; end: number }> = [];
    let buffer = "";
    let bufferStart = 0;
    const flush = (end: number): void => {
      if (buffer) pieces.push({ value: buffer, start: absoluteStart + bufferStart, end: absoluteStart + end });
      buffer = "";
      bufferStart = end;
    };
    for (let index = 0; index < raw.length;) {
      if (raw[index] === "\\") {
        const known = ["@", "<", "\\", "|", "{", "}", ...(dual ? [">"] : [])].includes(raw[index + 1] ?? "")
          ? { value: raw[index + 1]!, length: 2 }
          : undefined;
        const escape = known
          ?? fail("SCRIPT_ESCAPE", `Unknown Script escape "${raw.slice(index, index + 2)}".`, absoluteStart + index);
        buffer += escape.value;
        index += escape.length;
        continue;
      }
      buffer += raw[index];
      index += 1;
    }
    flush(raw.length);
    return pieces;
  };

  const literalString = (raw: string, start: number, dual = false): string =>
    literalPieces(raw, start, dual).map((piece) => piece.value).join("");

  const parseAttributeBlock = (raw: string, absoluteStart: number): ParsedAttributeBlock => {
    const close = findUnescaped(raw, "}", 1);
    if (close < 0) fail("SCRIPT_ATTRIBUTE", "Unclosed token attribute block.", absoluteStart);
    if (raw.slice(1, close).includes("{")) {
      fail("SCRIPT_ATTRIBUTE_NESTED", "Token attributes cannot be nested.", absoluteStart + 1);
    }
    const body = raw.slice(1, close).trim();
    if (!body) fail("SCRIPT_ATTRIBUTE_EMPTY", "Token attribute block must name at least one attribute.", absoluteStart);
    const attributes: CaptionWordAttribute[] = [];
    for (const part of body.split(",")) {
      const entry = part.trim();
      if (!entry) fail("SCRIPT_ATTRIBUTE", "Token attribute list contains an empty entry.", absoluteStart + 1);
      const equal = entry.indexOf("=");
      const name = (equal < 0 ? entry : entry.slice(0, equal)).trim();
      const valueRaw = equal < 0 ? undefined : entry.slice(equal + 1).trim();
      if (!ATTRIBUTE_NAME.test(name)) {
        fail("SCRIPT_ATTRIBUTE_NAME", `Invalid token attribute name "${name}".`, absoluteStart + 1);
      }
      if (valueRaw !== undefined && (!valueRaw || !ATTRIBUTE_VALUE.test(valueRaw))) {
        fail("SCRIPT_ATTRIBUTE_VALUE", `Invalid value for token attribute "${name}".`, absoluteStart + 1);
      }
      if (attributes.some((attribute) => attribute.name === name)) {
        fail("SCRIPT_ATTRIBUTE_DUPLICATE", `Token attribute "${name}" is repeated.`, absoluteStart + 1);
      }
      attributes.push({ name, value: valueRaw === undefined ? true : parseAttributeValue(valueRaw) });
    }
    return { attributes, length: close + 1 };
  };

  const parseMarkedDisplay = (
    raw: string,
    absoluteStart: number,
  ): { readonly display: string; readonly marks: readonly ParsedCaptionRegion["marks"][number][] } => {
    const parts: string[] = [];
    const marks: ParsedCaptionRegion["marks"][number][] = [];
    let cursor = 0;
    for (let index = 0; index < raw.length; index += 1) {
      if (raw[index] === "\\") {
        index += 1;
        continue;
      }
      if (raw[index] !== "{") continue;
      const block = parseAttributeBlock(raw.slice(index), absoluteStart + index);
      const before = raw.slice(0, index);
      if (!before || /\s$/u.test(before)) {
        fail("SCRIPT_ATTRIBUTE_TARGET", "A token attribute must immediately follow a display token.", absoluteStart + index);
      }
      const cleanBefore = literalString(before, absoluteStart, true);
      const displayIndex = displayWordSurfaces(cleanBefore).length - 1;
      if (displayIndex < 0) {
        fail("SCRIPT_ATTRIBUTE_TARGET", "A token attribute must follow a visible display token.", absoluteStart + index);
      }
      if (marks.some((mark) => mark.displayIndex === displayIndex)) {
        fail("SCRIPT_ATTRIBUTE_OVERLAP", "A display token cannot receive two separate attribute blocks.", absoluteStart + index);
      }
      parts.push(literalString(raw.slice(cursor, index), absoluteStart + cursor, true));
      marks.push({ displayIndex, attributes: block.attributes });
      cursor = index + block.length;
      index += block.length - 1;
    }
    parts.push(literalString(raw.slice(cursor), absoluteStart + cursor, true));
    return { display: parts.join(""), marks };
  };

  const assertDualDisplayLiteral = (raw: string, absoluteStart: number): void => {
    for (let index = 0; index < raw.length; index += 1) {
      if (raw[index] === "\\") {
        index += 1;
        continue;
      }
      if (raw[index] === "@") {
        fail("SCRIPT_DUAL_DISPLAY_MARKER", "Selection and Moment markers belong to spoken text, not the Dual display side; escape @ as \\@.", absoluteStart + index);
      }
      if (raw.startsWith("||", index)) {
        fail("SCRIPT_CAPTION_BREAK_DUAL", "Caption Cue break cannot occur inside Dual Text; split the Dual Text into separate units.", absoluteStart + index);
      }
    }
  };

  const addCaptionRegion = (
    displayValue: string,
    segmentId: string,
    tokenStart: number,
    tokenEndExclusive: number,
    kind: ParsedCaptionRegion["kind"],
    range: ParsedCaptionRegion["range"],
    marks: ParsedCaptionRegion["marks"] = [],
  ): void => {
    if (kind === "hidden") {
      if (tokenEndExclusive > tokenStart) {
        captionRegions.push({
          id: `caption-region:${captionRegions.length + 1}`,
          display: "",
          segmentId,
          startToken: tokenStart,
          endTokenExclusive: tokenEndExclusive,
          kind,
          marks: [],
          range,
        });
      }
      return;
    }
    const split = splitLeadingClosingPunctuation(displayValue);
    const previous = captionRegions.at(-1);
    const canAttachPrevious = previous !== undefined && previous.segmentId === segmentId;
    if (split.previous && canAttachPrevious) {
      captionRegions[captionRegions.length - 1] = {
        ...previous,
        display: cleanProjection(`${previous.display}${split.previous}`),
        range: { start: previous.range.start, end: range.end },
      };
    }
    const display = canAttachPrevious ? split.current : `${split.previous}${split.current}`;
    if (!display || tokenEndExclusive <= tokenStart) return;
    captionRegions.push({
      id: `caption-region:${captionRegions.length + 1}`,
      display,
      segmentId,
      startToken: tokenStart,
      endTokenExclusive: tokenEndExclusive,
      kind,
      marks,
      range,
    });
  };

  const markLastCaptionSurface = (
    attributes: readonly CaptionWordAttribute[],
    offset: number,
  ): void => {
    const previous = captionRegions.at(-1);
    if (previous === undefined || previous.kind === "hidden") {
      fail("SCRIPT_ATTRIBUTE_TARGET", "A token attribute must follow a visible display token.", offset);
    }
    const target = previous!;
    if (target.kind === "alias") {
      fail("SCRIPT_ATTRIBUTE_DUAL", "Annotate a Dual display word before the pipe; a mark cannot wrap a Dual Text.", offset);
    }
    const displayIndex = displayWordSurfaces(target.display).length - 1;
    if (displayIndex < 0) fail("SCRIPT_ATTRIBUTE_TARGET", "A token attribute must follow a visible display token.", offset);
    const existing = target.marks.find((mark) => mark.displayIndex === displayIndex);
    if (existing !== undefined) {
      fail("SCRIPT_ATTRIBUTE_OVERLAP", "A display token cannot receive two separate attribute blocks.", offset);
    }
    captionRegions[captionRegions.length - 1] = {
      ...target,
      marks: [...target.marks, { displayIndex, attributes }],
    };
  };

  const addText = (
    speech: string,
    caption: string,
    start: number,
    end: number,
    captureCaptionRegion = true,
  ): void => {
    if (!current) {
      if (speech.trim() || caption.trim()) {
        fail("SCRIPT_TEXT_OUTSIDE_SEGMENT", "Natural-language text is only allowed inside a named Segment.", start);
      }
      return;
    }
    current.lexicalRun += speech;
    const tokenStart = tokens.length;
    const editRanges = lexicalEditRanges(speech);
    const units = lexicalUnits(speech);
    // A punctuation-only piece can follow a display attribute or escaped source piece.
    const preceding = tokens.at(-1);
    const closing = splitLeadingClosingPunctuation(speech).previous;
    if (preceding?.segmentId === current.id && preceding.editRange.end === sourceOffset + start && closing && speech.startsWith(closing)) {
      tokens[tokens.length - 1] = { ...preceding, editRange: {
        start: preceding.editRange.start, end: sourceOffset + start + closing.length,
      } };
    }
    for (const [unitIndex, match] of units.entries()) {
      const normalized = normalizeWord(match.text);
      if (!normalized) continue;
      const index = tokens.length;
      const segmentTokenIndex = index - current.tokenStart;
      const id = tokenId(current.id, segmentTokenIndex);
      tokens.push({
        id,
        index,
        segmentId: current.id,
        segmentTokenIndex,
        startAnchorId: tokenAnchorId(current.id, segmentTokenIndex, "start"),
        endAnchorId: tokenAnchorId(current.id, segmentTokenIndex, "end"),
        text: match.text,
        normalized,
        range: {
          start: sourceOffset + start + match.index,
          end: sourceOffset + start + match.index + match.text.length,
        },
        editRange: {
          start: sourceOffset + start + editRanges[unitIndex]!.start,
          end: sourceOffset + start + editRanges[unitIndex]!.end,
        },
      });
    }
    current.atoms.push({
      kind: "text",
      speech,
      caption,
      tokenStart,
      tokenEndExclusive: tokens.length,
      range: { start: sourceOffset + start, end: sourceOffset + end },
    });
    if (captureCaptionRegion && cleanProjection(caption)) {
      addCaptionRegion(
        caption,
        current.id,
        tokenStart,
        tokens.length,
        "identity",
        { start: sourceOffset + start, end: sourceOffset + end },
      );
    }
  };

  const consumeSpeechSide = (
    raw: string,
    absoluteStart: number,
    caption: string,
    marks: ParsedCaptionRegion["marks"] = [],
  ): void => {
    const startToken = tokens.length;
    let partStart = 0;
    let index = 0;
    let emittedCaption = false;
    const addLiteral = (part: string, start: number): void => {
      for (const piece of literalPieces(part, start, true)) {
        addText(piece.value, emittedCaption ? "" : caption, piece.start, piece.end, false);
        emittedCaption = true;
      }
    };
    while (index < raw.length) {
      if (raw[index] === "\\") {
        index += 2;
        continue;
      }
      if (raw.startsWith("||", index)) {
        fail("SCRIPT_CAPTION_BREAK_DUAL", "Caption Cue break cannot occur inside Dual Text; split the Dual Text into separate units.", absoluteStart + index);
      }
      const marker = parseMarker(raw, index);
      if (!marker) {
        if (raw[index] === "@") fail("SCRIPT_MARKER", "Unescaped @ must begin a valid marker.", absoluteStart + index);
        index += 1;
        continue;
      }
      addLiteral(raw.slice(partStart, index), absoluteStart + partStart);
      addMarker(marker, absoluteStart + index);
      index += marker.length;
      partStart = index;
    }
    addLiteral(raw.slice(partStart), absoluteStart + partStart);
    if (tokens.length > startToken) {
      addCaptionRegion(
        caption,
        current!.id,
        startToken,
        tokens.length,
        cleanProjection(caption) ? "alias" : "hidden",
        { start: sourceOffset + absoluteStart, end: sourceOffset + absoluteStart + raw.length },
        marks,
      );
    }
  };

  const closeCurrent = (end: number, selfClosing: boolean, contentEnd = end): void => {
    const segment = current
      ?? fail("SCRIPT_SEGMENT_CLOSE", "Segment close has no matching open.", end);
    finishLexicalRun();
    segments.push({
      id: segment.id,
      index: segment.index,
      startAnchorId: segmentAnchorId(segment.id, "start"),
      endAnchorId: segmentAnchorId(segment.id, "end"),
      tokenStart: segment.tokenStart,
      tokenEndExclusive: tokens.length,
      atoms: segment.atoms,
      range: { start: segment.sourceStart, end: sourceOffset + end },
      contentRange: { start: segment.contentStart, end: sourceOffset + contentEnd },
      selfClosing,
    });
    current = undefined;
    structuralPosition += 1;
  };

  while (offset < source.length) {
    if (source.startsWith("<!--", offset)) {
      finishLexicalRun();
      const end = source.indexOf("-->", offset + 4);
      if (end < 0) fail("SCRIPT_COMMENT", "Unclosed Script comment.", offset);
      offset = end + 3;
      continue;
    }

    if (!current && source[offset] === "<") {
      const self = /^<([a-z][a-z0-9_-]{0,63})\s*\/>/u.exec(source.slice(offset));
      const open = self ?? /^<([a-z][a-z0-9_-]{0,63})\s*>/u.exec(source.slice(offset));
      if (open) {
        const id = open[1]!;
        if (!SEGMENT_ID.test(id) || RESERVED_SEGMENT_IDS.has(id)) {
          fail("SCRIPT_SEGMENT_ID", `Invalid or reserved Segment id "${id}".`, offset);
        }
        if (segments.some((segment) => segment.id === id)) {
          fail("SCRIPT_SEGMENT_DUPLICATE", `Duplicate Segment id "${id}".`, offset);
        }
        const contentStart = offset + open[0].length;
        current = {
          id,
          index: segments.length,
          atoms: [],
          tokenStart: tokens.length,
          sourceStart: sourceOffset + offset,
          contentStart: sourceOffset + contentStart,
          lexicalRun: "",
          lexicalMarkers: [],
        };
        offset = contentStart;
        if (self) closeCurrent(offset, true);
        continue;
      }
      const close = /^<\/([^>]+)>/u.exec(source.slice(offset));
      if (close) fail("SCRIPT_SEGMENT_CLOSE", `Unexpected Segment close </${close[1]}>.`, offset);
      fail(
        "SCRIPT_SEGMENT_OPEN",
        "Script body expects a lower-case named Segment without attributes.",
        offset,
      );
    }

    if (current && source.startsWith("</", offset)) {
      const close = /^<\/([a-z][a-z0-9_-]{0,63})\s*>/u.exec(source.slice(offset))
        ?? fail("SCRIPT_SEGMENT_CLOSE", "Malformed Segment close.", offset);
      if (close[1] !== current.id) {
        fail("SCRIPT_SEGMENT_MISMATCH", `Segment "${current.id}" was closed by "${close[1]}".`, offset);
      }
      const contentEnd = offset;
      offset += close[0].length;
      closeCurrent(offset, false, contentEnd);
      continue;
    }

    const marker = parseMarker(source, offset);
    if (marker) {
      addMarker(marker, offset);
      offset += marker.length;
      continue;
    }
    if (source[offset] === "@") fail("SCRIPT_MARKER", "Unescaped @ must begin a valid marker.", offset);

    if (source[offset] === "<" && current) {
      const end = findUnescaped(source, ">", offset + 1);
      if (end < 0) fail("SCRIPT_ANGLE", "Unclosed Script angle construct.", offset);
      const inside = source.slice(offset + 1, end);
      const pipe = findUnescaped(inside, "|");
      if (pipe >= 0) {
        finishLexicalRun();
        assertDualDisplayLiteral(inside.slice(0, pipe), offset + 1);
        const markedDisplay = parseMarkedDisplay(inside.slice(0, pipe), offset + 1);
        const display = markedDisplay.display;
        const speech = inside.slice(pipe + 1);
        if (!speech.replace(/~?@\/?[A-Za-z_][A-Za-z0-9_.-]*!?~?/gu, "").trim()) {
          fail("SCRIPT_DUAL_EMPTY", "Dual Text speech side must not be empty.", offset);
        }
        consumeSpeechSide(speech, offset + pipe + 2, display, markedDisplay.marks);
        finishLexicalRun();
        offset = end + 1;
        continue;
      }
      if (!ROLE_LABEL.test(inside)) fail("SCRIPT_ANGLE", `Unknown Script construct <${inside}>.`, offset);
      finishLexicalRun();
      current.atoms.push({
        kind: "role",
        label: inside,
        range: { start: sourceOffset + offset, end: sourceOffset + end + 1 },
      });
      offset = end + 1;
      continue;
    }

    const textStart = offset;
    while (offset < source.length) {
      if (
        source.startsWith("<!--", offset)
        || parseMarker(source, offset)
        || source[offset] === "<"
        || source[offset] === "@"
        || source[offset] === "{"
        || source.startsWith("||", offset)
      ) break;
      if (source[offset] === "\\") {
        offset += Math.min(2, source.length - offset);
        continue;
      }
      offset += 1;
    }
    const raw = source.slice(textStart, offset);
    for (const piece of literalPieces(raw, textStart)) addText(piece.value, piece.value, piece.start, piece.end);
    if (source[offset] === "{") {
      const block = parseAttributeBlock(source.slice(offset), offset);
      if (!raw || /\s$/u.test(raw)) {
        fail("SCRIPT_ATTRIBUTE_TARGET", "A token attribute must immediately follow a display token.", offset);
      }
      markLastCaptionSurface(block.attributes, offset);
      const token = tokens.at(-1)!;
      tokens[tokens.length - 1] = { ...token, editRange: {
        start: token.editRange.start, end: sourceOffset + offset + block.length,
      } };
      offset += block.length;
      continue;
    }
    if (source.startsWith("||", offset)) {
      if (!current || tokens.length === current.tokenStart) {
        fail("SCRIPT_CAPTION_BREAK_EMPTY", "Caption Cue break must follow visible Script text.", offset);
      }
      captionBreaks.push({
        tokenIndex: tokens.length,
        range: { start: sourceOffset + offset, end: sourceOffset + offset + 2 },
      });
      offset += 2;
    }
  }

  if (current) fail("SCRIPT_SEGMENT_UNCLOSED", `Segment "${current.id}" is not closed.`);
  const dangling = openSelections.keys().next().value as string | undefined;
  if (dangling) fail("SCRIPT_SELECTION_UNCLOSED", `Selection "${dangling}" is not closed.`);
  if (!segments.length) fail("SCRIPT_SEGMENT_CARDINALITY", "Script requires at least one Segment.");

  const speechSegments: string[] = [];
  const captionSegments: string[] = [];
  const dialogueTurns: string[] = [];
  const turns: ParsedTurn[] = [];
  for (const segment of segments) {
    const speechTurnBodies: string[] = [];
    const captionTurnBodies: string[] = [];
    let activeRole: { readonly label: string; readonly start: number } | undefined;
    let sawRole = false;
    let unownedSpeech = "";
    let turnParts: string[] = [];
    let captionTurnParts: string[] = [];
    let turnTokenStart: number | undefined;
    let turnTokenEndExclusive: number | undefined;
    let turnEnd = segment.range.end;
    const flushTurn = (): void => {
      const body = joinProjection(turnParts);
      if (activeRole && !body) {
        fail("SCRIPT_ROLE_EMPTY", `Role Cue <${activeRole.label}> is not followed by spoken content.`, activeRole.start - sourceOffset);
      }
      if (body) {
        dialogueTurns.push(activeRole ? `${activeRole.label}: ${body}` : body);
        speechTurnBodies.push(body);
      }
      const captionBody = joinProjection(captionTurnParts);
      if (captionBody) captionTurnBodies.push(captionBody);
      if (turnTokenStart !== undefined && turnTokenEndExclusive !== undefined) {
        const ordinal = turns.filter((turn) => turn.segmentId === segment.id).length + 1;
        turns.push({
          id: `segment:${segment.id}:turn:${ordinal}`,
          segmentId: segment.id,
          ...(activeRole ? { role: activeRole.label } : {}),
          tokenStart: turnTokenStart,
          tokenEndExclusive: turnTokenEndExclusive,
          range: { start: activeRole?.start ?? segment.range.start, end: turnEnd },
        });
      }
      turnParts = [];
      captionTurnParts = [];
      turnTokenStart = undefined;
      turnTokenEndExclusive = undefined;
    };
    for (const atom of segment.atoms) {
      if (atom.kind === "role") {
        if (!sawRole && cleanProjection(unownedSpeech)) {
          fail("SCRIPT_ROLE_AFTER_TEXT", `Segment "${segment.id}" introduces a Role Cue after unowned speech.`, atom.range.start - sourceOffset);
        }
        flushTurn();
        activeRole = { label: atom.label, start: atom.range.start };
        sawRole = true;
        continue;
      }
      if (!sawRole) unownedSpeech += atom.speech;
      turnParts.push(atom.speech);
      captionTurnParts.push(atom.caption);
      if (atom.tokenEndExclusive > atom.tokenStart) {
        turnTokenStart ??= atom.tokenStart;
        turnTokenEndExclusive = atom.tokenEndExclusive;
        turnEnd = atom.range.end;
      }
    }
    flushTurn();
    const speech = cleanProjection(speechTurnBodies.join(" "));
    const caption = cleanProjection(captionTurnBodies.join(" "));
    if (speech) speechSegments.push(speech);
    if (caption) captionSegments.push(caption);
  }

  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  /**
   * Resolve one marker to the exact `2m + 2n + 2` anchor its affinity names. Token and
   * Segment cuts are equal citizens: a marker with nothing to its left inside a
   * Segment snaps to that Segment's own start, never across into the previous
   * Segment, whose end may sit at a different time. At the Script body's outer
   * cuts, affinity distinguishes the Program boundary from its first/last Segment.
   */
  const anchorForBoundary = (boundary: RawMarkerBoundary, affinity: Affinity): string => {
    if (segments.length === 0) fail("SCRIPT_ANCHOR_UNRESOLVED", "Script declares no Segment to anchor markers to.");
    const inside = boundary.segmentId === undefined ? undefined : segmentById.get(boundary.segmentId);
    if (inside) {
      if (affinity === "left") {
        return boundary.tokenIndex > inside.tokenStart
          ? tokens[boundary.tokenIndex - 1]!.endAnchorId
          : inside.startAnchorId;
      }
      return boundary.tokenIndex < inside.tokenEndExclusive
        ? tokens[boundary.tokenIndex]!.startAnchorId
        : inside.endAnchorId;
    }
    // Outside or between Segments: structuralPosition counts the Segments already closed.
    if (affinity === "left") {
      const previous = segments[boundary.structuralPosition - 1];
      return previous ? previous.endAnchorId : "program:start";
    }
    const next = segments[boundary.structuralPosition];
    return next ? next.startAnchorId : "program:end";
  };
  const anchored = <T extends { readonly affinity: Affinity; readonly boundary: RawMarkerBoundary }>(
    edge: T,
  ): Omit<T, "boundary"> & { readonly boundary: MarkerBoundary } => ({
    ...edge,
    boundary: { ...edge.boundary, anchorId: anchorForBoundary(edge.boundary, edge.affinity) },
  });

  const anchors: SemanticAnchor[] = [
    { id: "program:start", kind: "program-start" },
    ...segments.flatMap((segment) => [
      { id: segment.startAnchorId, kind: "segment-start" as const, segmentId: segment.id },
      ...tokens.slice(segment.tokenStart, segment.tokenEndExclusive).flatMap((token) => [
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
      { id: segment.endAnchorId, kind: "segment-end" as const, segmentId: segment.id },
    ]),
    { id: "program:end", kind: "program-end" },
  ];
  if (anchors.length !== 2 * tokens.length + 2 * segments.length + 2) {
    fail("SCRIPT_ANCHOR_CARDINALITY", "Semantic anchor cardinality is not 2M + 2N + 2.");
  }
  return {

    sourceRange: { start: sourceOffset, end: sourceOffset + source.length },
    segments,
    tokens,
    turns,
    selections: [...selections].sort(([left], [right]) => left.localeCompare(right)).map(([, selection]) => {
      const open = anchored(selection.open);
      const close = anchored(selection.close);
      return {
        ...selection,
        startAnchorId: open.boundary.anchorId,
        endAnchorId: close.boundary.anchorId,
        open,
        close,
      };
    }),
    moments: [...moments].sort(([left], [right]) => left.localeCompare(right)).map(([, moment]) => {
      const value = anchored(moment);
      return { ...value, anchorId: value.boundary.anchorId };
    }),
    captionProjection: {
      text: captionSegments.join("\n"),
      regions: captionRegions,
      breaks: captionBreaks,
    },
    semanticIndex: {

      anchors,
    },
    serializations: {
      dialogue: dialogueTurns.join("\n"),
      speech: speechSegments.join("\n"),
    },
  };
}
