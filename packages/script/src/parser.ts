import { digestOf } from "@svml/core";

import { ScriptSyntaxError } from "./error.js";
import type {
  Affinity,
  MarkerBoundary,
  ParsedAtom,
  ParsedCaptionRefinement,
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
  lexicalRun: string;
  readonly lexicalMarkers: Array<{ readonly position: number; readonly offset: number }>;
};

const WORD =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]\p{M}*|[\p{L}\p{M}\p{N}]+(?:['’.-][\p{L}\p{M}\p{N}]+)*/gu;
const SEGMENT_ID = /^[a-z][a-z0-9_-]{0,63}$/u;
const TEMPORAL_ID = /^[a-z][a-z0-9_-]{0,63}$/u;
const ROLE_LABEL = /^[\p{L}\p{M}\p{N}_](?:[\p{L}\p{M}\p{N}_. -]{0,30}[\p{L}\p{M}\p{N}_.-])?$/u;
const RESERVED_SEGMENT_IDS = new Set(["script"]);

function normalizeWord(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
}

type WordLexeme = {
  readonly text: string;
  readonly normalized: string;
  readonly start: number;
  readonly end: number;
};

function wordLexemes(value: string): WordLexeme[] {
  const lexemes: WordLexeme[] = [];
  WORD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD.exec(value))) {
    const normalized = normalizeWord(match[0]);
    if (!normalized) continue;
    lexemes.push({
      text: match[0],
      normalized,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return lexemes;
}

function exactCaptionRefinements(
  regionId: string,
  display: string,
  speechTokens: readonly ParsedToken[],
): ParsedCaptionRefinement[] {
  const displayWords = wordLexemes(display);
  if (!displayWords.length || !speechTokens.length) return [];

  let matches: Array<{ readonly displayIndex: number; readonly speechIndex: number }>;
  if (
    displayWords.length === speechTokens.length
    && displayWords.every((word, index) => word.normalized === speechTokens[index]!.normalized)
  ) {
    matches = displayWords.map((_, index) => ({ displayIndex: index, speechIndex: index }));
  } else {
    const displayCounts = new Map<string, number>();
    const speechCounts = new Map<string, number>();
    for (const word of displayWords) displayCounts.set(word.normalized, (displayCounts.get(word.normalized) ?? 0) + 1);
    for (const token of speechTokens) speechCounts.set(token.normalized, (speechCounts.get(token.normalized) ?? 0) + 1);
    const candidates = displayWords.flatMap((word, displayIndex) => {
      if (displayCounts.get(word.normalized) !== 1 || speechCounts.get(word.normalized) !== 1) return [];
      const speechIndex = speechTokens.findIndex((token) => token.normalized === word.normalized);
      return speechIndex < 0 ? [] : [{ displayIndex, speechIndex }];
    });

    // Keep a longest monotonic chain. Exact words that cross after an alias
    // rewrite are individually plausible, but cannot form a temporal caption
    // refinement without reversing display order.
    const chains: Array<Array<{ readonly displayIndex: number; readonly speechIndex: number }>> = [];
    for (let index = 0; index < candidates.length; index += 1) {
      let best: Array<{ readonly displayIndex: number; readonly speechIndex: number }> = [];
      for (let before = 0; before < index; before += 1) {
        if (candidates[before]!.speechIndex < candidates[index]!.speechIndex && chains[before]!.length > best.length) {
          best = chains[before]!;
        }
      }
      chains.push([...best, candidates[index]!]);
    }
    matches = chains.reduce<typeof candidates>(
      (best, chain) => chain.length > best.length ? chain : best,
      [],
    );
  }

  return matches.map(({ displayIndex, speechIndex }, index) => {
    const word = displayWords[displayIndex]!;
    const token = speechTokens[speechIndex]!;
    return {
      id: `${regionId}:exact:${index + 1}`,
      display: word.text,
      displayStart: word.start,
      displayEnd: word.end,
      startToken: token.index,
      endTokenExclusive: token.index + 1,
      relation: "exact",
    };
  });
}

function cleanProjection(value: string): string {
  return value
    .replace(/\s+/gu, " ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/([([{])\s+/gu, "$1")
    .replace(/\s+([)\]}])/gu, "$1")
    .trim();
}

function joinProjection(parts: readonly string[]): string {
  return cleanProjection(parts.filter((part) => part.trim()).join(" "));
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

export function parseScript(
  sourceName: string,
  input: string,
  sourceOffset = 0,
  bindings: Readonly<Record<string, string>> = {},
): ParsedNarrative {
  const source = input.replace(/\r\n?/gu, "\n").normalize("NFC");
  const fail = (code: string, message: string, offset?: number): never => {
    throw new ScriptSyntaxError(code, message, sourceName, offset === undefined ? undefined : sourceOffset + offset);
  };

  const segments: ParsedSegment[] = [];
  const tokens: ParsedToken[] = [];
  const captionRegions: ParsedCaptionRegion[] = [];
  const selections = new Map<string, ParsedSelection["occurrences"] extends readonly (infer T)[] ? T[] : never>();
  const moments = new Map<string, ParsedMoment["occurrences"] extends readonly (infer T)[] ? T[] : never>();
  const openSelections = new Map<string, {
    readonly affinity: Affinity;
    readonly boundary: MarkerBoundary;
    readonly start: number;
    readonly end: number;
  }>();
  let current: MutableSegment | undefined;
  let offset = 0;
  let structuralPosition = 0;

  const boundary = (): MarkerBoundary => ({
    tokenIndex: tokens.length,
    structuralPosition,
    ...(current ? { segmentId: current.id } : {}),
  });

  const finishLexicalRun = (): void => {
    if (!current) return;
    WORD.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WORD.exec(current.lexicalRun))) {
      const start = match.index;
      const end = start + match[0].length;
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
      const values = moments.get(marker.id) ?? [];
      values.push({
        occurrence: values.length,
        affinity: marker.affinity,
        boundary: boundary(),
        range: { start: sourceOffset + start, end: sourceOffset + start + marker.length },
      });
      moments.set(marker.id, values);
      return;
    }
    if (marker.kind === "open") {
      if (moments.has(marker.id)) {
        fail("SCRIPT_TEMPORAL_TYPE", `Temporal name "${marker.id}" cannot be both Selection and Moment.`, start);
      }
      if (openSelections.has(marker.id)) {
        fail("SCRIPT_SELECTION_REOPENED", `Selection "${marker.id}" is reopened before it closes.`, start);
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
    const values = selections.get(marker.id) ?? [];
    values.push({
      occurrence: values.length,
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
    selections.set(marker.id, values);
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
      if (raw.startsWith("${", index)) {
        flush(index);
        const close = raw.indexOf("}", index + 2);
        if (close < 0) fail("SCRIPT_SLOT_UNCLOSED", "Unclosed Script Slot.", absoluteStart + index);
        const id = raw.slice(index + 2, close);
        if (!/^[\p{L}_][\p{L}\p{M}\p{N}_-]{0,63}$/u.test(id)) {
          fail("SCRIPT_SLOT_ID", `Invalid Script Slot "${id}".`, absoluteStart + index);
        }
        const value = bindings[id]
          ?? fail("SCRIPT_SLOT_UNBOUND", `Script Slot "${id}" is not bound.`, absoluteStart + index);
        if (/[\r\n\p{Cc}]/u.test(value)) fail("SCRIPT_SLOT_VALUE", `Script Slot "${id}" must be single-line text.`);
        pieces.push({ value, start: absoluteStart + index, end: absoluteStart + close + 1 });
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
    WORD.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WORD.exec(speech))) {
      const normalized = normalizeWord(match[0]);
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
        text: match[0],
        normalized,
        range: {
          start: sourceOffset + start + match.index,
          end: sourceOffset + start + match.index + match[0].length,
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
    const display = cleanProjection(caption);
    if (captureCaptionRegion && display && tokens.length > tokenStart) {
      const id = `caption-region:${captionRegions.length + 1}`;
      captionRegions.push({
        id,
        display,
        segmentId: current.id,
        startToken: tokenStart,
        endTokenExclusive: tokens.length,
        kind: "identity",
        refinements: exactCaptionRefinements(id, display, tokens.slice(tokenStart)),
        range: { start: sourceOffset + start, end: sourceOffset + end },
      });
    }
  };

  const consumeSpeechSide = (raw: string, absoluteStart: number, caption: string): void => {
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
      if (raw.startsWith("${", index)) {
        const close = raw.indexOf("}", index + 2);
        if (close < 0) fail("SCRIPT_SLOT_UNCLOSED", "Unclosed Script Slot.", absoluteStart + index);
        index = close + 1;
        continue;
      }
      if (raw[index] === "\\") {
        index += raw.startsWith("\\${", index) ? 3 : 2;
        continue;
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
      const display = cleanProjection(caption);
      const id = `caption-region:${captionRegions.length + 1}`;
      const speechTokens = tokens.slice(startToken);
      captionRegions.push({
        id,
        display,
        segmentId: current!.id,
        startToken,
        endTokenExclusive: tokens.length,
        kind: display ? (cleanProjection(speechTokens.map((token) => token.text).join(" ")) === display ? "identity" : "alias") : "hidden",
        refinements: exactCaptionRefinements(id, display, speechTokens),
        range: { start: sourceOffset + absoluteStart, end: sourceOffset + absoluteStart + raw.length },
      });
    }
  };

  const closeCurrent = (end: number, selfClosing: boolean): void => {
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
        current = {
          id,
          index: segments.length,
          atoms: [],
          tokenStart: tokens.length,
          sourceStart: sourceOffset + offset,
          lexicalRun: "",
          lexicalMarkers: [],
        };
        offset += open[0].length;
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
      offset += close[0].length;
      closeCurrent(offset, false);
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
        const display = literalString(inside.slice(0, pipe), offset + 1, true);
        const speech = inside.slice(pipe + 1);
        if (!speech.replace(/~?@\/?[A-Za-z_][A-Za-z0-9_.-]*!?~?/gu, "").trim()) {
          fail("SCRIPT_DUAL_EMPTY", "Dual Text speech side must not be empty.", offset);
        }
        consumeSpeechSide(speech, offset + pipe + 2, display);
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
      ) break;
      if (source[offset] === "\\") {
        offset += source.startsWith("\\${", offset) ? 3 : Math.min(2, source.length - offset);
        continue;
      }
      offset += 1;
    }
    const raw = source.slice(textStart, offset);
    for (const piece of literalPieces(raw, textStart)) addText(piece.value, piece.value, piece.start, piece.end);
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
    const speechParts: string[] = [];
    const captionParts: string[] = [];
    let activeRole: { readonly label: string; readonly start: number } | undefined;
    let sawRole = false;
    let unownedSpeech = "";
    let turnParts: string[] = [];
    let turnTokenStart: number | undefined;
    let turnTokenEndExclusive: number | undefined;
    let turnEnd = segment.range.end;
    const flushTurn = (): void => {
      const body = joinProjection(turnParts);
      if (activeRole && !body) {
        fail("SCRIPT_ROLE_EMPTY", `Role Cue <${activeRole.label}> is not followed by spoken content.`, activeRole.start - sourceOffset);
      }
      if (body) dialogueTurns.push(activeRole ? `${activeRole.label}: ${body}` : body);
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
      speechParts.push(atom.speech);
      captionParts.push(atom.caption);
      if (!sawRole) unownedSpeech += atom.speech;
      turnParts.push(atom.speech);
      if (atom.tokenEndExclusive > atom.tokenStart) {
        turnTokenStart ??= atom.tokenStart;
        turnTokenEndExclusive = atom.tokenEndExclusive;
        turnEnd = atom.range.end;
      }
    }
    flushTurn();
    const speech = joinProjection(speechParts);
    const caption = joinProjection(captionParts);
    if (speech) speechSegments.push(speech);
    if (caption) captionSegments.push(caption);
  }

  const anchors: SemanticAnchor[] = segments.flatMap((segment) => [
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
  ]);
  if (anchors.length !== 2 * tokens.length + 2 * segments.length) {
    fail("SCRIPT_ANCHOR_CARDINALITY", "Semantic anchor cardinality is not 2M + 2N.");
  }
  return {
    contract: "svml.narrative@1",
    segments,
    tokens,
    turns,
    selections: [...selections].sort(([left], [right]) => left.localeCompare(right)).map(([id, occurrences]) => ({ id, occurrences })),
    moments: [...moments].sort(([left], [right]) => left.localeCompare(right)).map(([id, occurrences]) => ({ id, occurrences })),
    captionProjection: {
      contract: "svml.caption-projection@1",
      text: captionSegments.join("\n"),
      regions: captionRegions,
    },
    semanticIndex: {
      contract: "svml.semantic-index@1",
      anchors,
    },
    serializations: {
      dialogue: dialogueTurns.join("\n"),
      speech: speechSegments.join("\n"),
    },
  };
}
