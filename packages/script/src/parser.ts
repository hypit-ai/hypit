import { ScriptSyntaxError } from "./error.js";
import { analyzeProse, cleanProjection, displaySurfaces, lexicalCount, lexicalUnits, splitDisplayPrefix } from "./lexical.js";
import type {
  ScriptBoundary, ScriptCue, ScriptDisplayWord, ScriptDocument, ScriptSegment, ScriptSelection, ScriptTurn, ScriptUnit,
  ScriptWordAttribute, SpokenRange,
} from "./types.js";

const identifier = "[a-z][a-z0-9_-]{0,63}";
const segmentOpen = new RegExp(`^<(${identifier})\\s*(/?)>`, "u");
const segmentClose = new RegExp(`^</(${identifier})\\s*>`, "u");
const roleLabel = /^[\p{L}\p{M}\p{N}_](?:[\p{L}\p{M}\p{N}_. -]{0,30}[\p{L}\p{M}\p{N}_.-])?$/u;
const temporalMarker = new RegExp(`^@\\{(~)?(/)?(${identifier})([!~])?\\}`, "u");
const attributeName = new RegExp(`^${identifier}$`, "u");
const attributeValue = /^[A-Za-z0-9_.:-]+$/u;

type AttributeMark = { readonly displayIndex: number; readonly attributes: readonly ScriptWordAttribute[] };
type Annotation = { readonly position: number; readonly offset: number; readonly attributes: readonly ScriptWordAttribute[] };
type CaptionRegion = {
  display: string;
  readonly spoken: SpokenRange;
  readonly separatorBefore: "" | " ";
  readonly dual: boolean;
  readonly marks: readonly AttributeMark[];
};
type Boundary = { word: number; readonly side: "left" | "right"; readonly offset: number };
type CueBreak = { word: number; readonly offset: number };
type PendingTurn = { readonly role?: string; readonly startWord: number; readonly offset: number };
type Segment = {
  readonly id: string;
  readonly spokenWords: string[];
  readonly turns: ScriptTurn[];
  readonly regions: CaptionRegion[];
  readonly breaks: CueBreak[];
  readonly moments: Map<string, Boundary>;
  readonly selections: Map<string, { start: Boundary; end: Boundary }>;
  readonly openSelections: Map<string, Boundary>;
  turn: PendingTurn;
  previousDisplay?: CaptionRegion;
  pendingSpace: string;
};
type Fail = (code: string, message: string, offset: number) => never;

function unescaped(value: string, character: string, from: number): number {
  for (let index = from; index < value.length; index += 1) {
    if (value[index] === "\\") index += 1;
    else if (value[index] === character) return index;
  }
  return -1;
}

function scalar(raw: string): ScriptWordAttribute["value"] {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(raw) && Number.isFinite(Number(raw))) return Number(raw);
  return raw;
}

function readAttributes(source: string, offset: number, fail: Fail) {
  const end = unescaped(source, "}", offset + 1);
  if (end < 0) return fail("SCRIPT_ATTRIBUTE", "Unclosed word attributes.", offset);
  const declarations = source.slice(offset + 1, end).split(",");
  const attributes = declarations.map(declaration => {
    const [key, raw, ...extra] = declaration.trim().split("=");
    const name = key!.trim();
    const value = raw?.trim();
    if (!attributeName.test(name) || extra.length > 0 || (value !== undefined && !attributeValue.test(value))) {
      return fail("SCRIPT_ATTRIBUTE", `Invalid word attribute ${JSON.stringify(declaration.trim())}.`, offset);
    }
    return { name, value: value === undefined ? true : scalar(value) };
  });
  if (new Set(attributes.map(attribute => attribute.name)).size !== attributes.length) {
    return fail("SCRIPT_ATTRIBUTE_DUPLICATE", "Word attributes repeat a name.", offset);
  }
  return { attributes, next: end + 1 };
}

function markDisplayWords(display: string, annotations: readonly Annotation[], fail: Fail): readonly AttributeMark[] {
  const units = lexicalUnits(display);
  const seen = new Set<number>();
  return annotations.map(annotation => {
    const displayIndex = units.length === 0
      ? (display.trim() && annotation.position === display.trimEnd().length ? 0 : -1)
      : units.findLastIndex(unit => unit.index + unit.text.length <= annotation.position);
    if (displayIndex < 0 || units.some(unit => unit.index < annotation.position && annotation.position < unit.index + unit.text.length)) {
      return fail("SCRIPT_ATTRIBUTE_TARGET", "A word attribute must follow a complete display word.", annotation.offset);
    }
    if (seen.has(displayIndex)) return fail("SCRIPT_ATTRIBUTE_DUPLICATE", "A display word already has attributes.", annotation.offset);
    seen.add(displayIndex);
    return { displayIndex, attributes: annotation.attributes };
  });
}

/** Preserve prose punctuation across typed regions, including punctuation adjacent to a Dual. */
function appendRegion(segment: Segment, raw: string, spoken: SpokenRange, dual: boolean, marks: readonly AttributeMark[]) {
  const value = (segment.pendingSpace + (dual ? cleanProjection(raw) : raw)).replace(/\s+/gu, " ");
  const previous = segment.previousDisplay;
  const split = splitDisplayPrefix(value, previous !== undefined);
  if (previous && split.previous.trim()) previous.display += split.previous.trimEnd();
  segment.pendingSpace = /\s$/u.test(value) ? " " : "";
  const display = (previous ? split.current : split.previous + split.current).trim();
  if (spoken.endWordExclusive <= spoken.startWord) {
    segment.pendingSpace = previous ? split.current || segment.pendingSpace : value;
    return;
  }
  if (!display) return;
  const region: CaptionRegion = { display, spoken, dual, marks,
    separatorBefore: previous && /\s$/u.test(split.previous) ? " " : "" };
  segment.regions.push(region);
  segment.previousDisplay = region;
}

function resolveBoundary(boundary: Boundary, wordCount: number): ScriptBoundary {
  if (boundary.side === "left") {
    return boundary.word > 0 ? { edge: "end", word: boundary.word - 1 } : { edge: "segment-start" };
  }
  return boundary.word < wordCount ? { edge: "start", word: boundary.word } : { edge: "segment-end" };
}

function captionCues(segment: Segment, allocateCue: () => number, allocateUnit: () => number, fail: Fail): ScriptCue[] {
  const cues: ScriptCue[] = [];
  let units: ScriptUnit[] = [];
  let role: string | undefined;
  let turnIndex = 0;
  let breakIndex = 0;
  const breaks = segment.breaks;
  const flush = () => {
    if (units.length === 0) return;
    cues.push({ id: allocateCue(), units, ...(role === undefined ? {} : { role }) });
    units = [];
  };
  function append(words: readonly ScriptDisplayWord[], startWord: number, endWordExclusive: number) {
    let cut = false;
    while (breakIndex < breaks.length && breaks[breakIndex]!.word <= startWord) {
      breakIndex += 1;
      cut = true;
    }
    const nextBreak = breaks[breakIndex];
    if (nextBreak !== undefined && nextBreak.word < endWordExclusive) {
      fail("SCRIPT_CUE_BOUNDARY", "A cue break cannot split a display unit.", nextBreak.offset);
    }
    while (segment.turns[turnIndex]!.spoken.endWordExclusive <= startWord) {
      flush();
      turnIndex += 1;
    }
    if (cut) flush();
    role = segment.turns[turnIndex]!.role;
    units.push({ id: allocateUnit(), spoken: { startWord, endWordExclusive }, words });
  }
  for (const region of segment.regions) {
    const words = displaySurfaces(region.display).map((word, index) => ({
      text: word.text,
      separatorBefore: index === 0 ? region.separatorBefore : word.separatorBefore,
      attributes: region.marks.find(mark => mark.displayIndex === index)?.attributes ?? [],
    }));
    const { startWord, endWordExclusive } = region.spoken;
    if (region.dual) {
      append(words, startWord, endWordExclusive);
      continue;
    }
    let wordIndex = startWord;
    for (const word of words) {
      const next = wordIndex + lexicalCount(word.text);
      if (next <= wordIndex || next > endWordExclusive) {
        fail("SCRIPT_CAPTION_CORRESPONDENCE", `Display text in Segment ${segment.id} has no complete spoken unit.`, segment.turn.offset);
      }
      append([word], wordIndex, next);
      wordIndex = next;
    }
    if (wordIndex !== endWordExclusive) fail("SCRIPT_CAPTION_CORRESPONDENCE", `Display text in Segment ${segment.id} does not cover its spoken words.`, segment.turn.offset);
  }
  flush();
  return cues;
}

/** Parse source text into segment-local speech, caption and boundary references. */
export function parseScript(sourceName: string, source: string): ScriptDocument {
  const segments = new Map<string, ScriptSegment>();
  let current: Segment | undefined;
  let nextCue = 1;
  let nextUnit = 1;
  let offset = 0;
  let run = "";
  let annotations: Annotation[] = [];
  let events: { position: number; boundary: Boundary | CueBreak }[] = [];

  const fail: Fail = (code, message, position) => { throw new ScriptSyntaxError(code, message, sourceName, position); };

  function flushRun(segment: Segment, visible: boolean) {
    const { units, editRanges } = analyzeProse(run, visible && segment.previousDisplay !== undefined);
    const startWord = segment.spokenWords.length;
    let editIndex = 0;
    let wordIndex = 0;
    for (const { position, boundary } of events) {
      while (editIndex < editRanges.length && editRanges[editIndex]!.end <= position) editIndex += 1;
      const range = editRanges[editIndex];
      if (range && range.start < position) {
        fail("SCRIPT_WORD_BOUNDARY", "A marker or cue break must fall between complete words.", boundary.offset);
      }
      while (wordIndex < units.length && units[wordIndex]!.index + units[wordIndex]!.text.length <= position) wordIndex += 1;
      boundary.word = startWord + wordIndex;
    }
    const marks = markDisplayWords(run, annotations, fail);
    segment.spokenWords.push(...units.map(unit => unit.text));
    const spoken = { startWord, endWordExclusive: segment.spokenWords.length };
    if (visible) appendRegion(segment, run, spoken, false, marks);
    run = "";
    annotations = [];
    events = [];
    return { spoken, marks };
  }

  function closeTurn(segment: Segment) {
    const { role, startWord, offset } = segment.turn;
    const endWordExclusive = segment.spokenWords.length;
    if (startWord === endWordExclusive) {
      if (role !== undefined) fail("SCRIPT_ROLE_EMPTY", `Speaker ${role} has no speech.`, offset);
      return;
    }
    segment.turns.push({ ...(role === undefined ? {} : { role }), spoken: { startWord, endWordExclusive } });
  }

  function closeSegment(segment: Segment) {
    flushRun(segment, true);
    closeTurn(segment);
    const open = segment.openSelections.entries().next().value;
    if (open) fail("SCRIPT_SELECTION_UNCLOSED", `Selection ${open[0]} is not closed.`, open[1].offset);
    const count = segment.spokenWords.length;
    const moments = new Map([...segment.moments].map(([name, boundary]) => [name, resolveBoundary(boundary, count)]));
    const selections = new Map([...segment.selections].map(([name, edges]) => [
      name, { start: resolveBoundary(edges.start, count), end: resolveBoundary(edges.end, count) } satisfies ScriptSelection,
    ]));
    segments.set(segment.id, { id: segment.id, spokenWords: segment.spokenWords, turns: segment.turns,
      moments, selections, cues: captionCues(segment, () => nextCue++, () => nextUnit++, fail) });
    current = undefined;
  }

  function addMarker(segment: Segment, match: RegExpExecArray, position: number) {
    const [, left, close, name, suffix] = match;
    if ((close && (left || suffix === "!")) || (!close && suffix === "~")) {
      return fail("SCRIPT_MARKER", "Invalid temporal marker.", position);
    }
    const id = name!;
    const boundary: Boundary = {
      word: segment.spokenWords.length, side: close ? suffix === "~" ? "right" : "left" : left ? "left" : "right", offset: position,
    };
    if (close) {
      const open = segment.openSelections.get(id);
      if (!open) return fail("SCRIPT_SELECTION_CLOSE", `Selection ${id} has no opening marker in Segment ${segment.id}.`, position);
      segment.openSelections.delete(id);
      segment.selections.set(id, { start: open, end: boundary });
    } else {
      if (segment.moments.has(id) || segment.selections.has(id) || segment.openSelections.has(id)) {
        return fail("SCRIPT_MARKER_DUPLICATE", `Repeated name ${id} in Segment ${segment.id}.`, position);
      }
      (suffix === "!" ? segment.moments : segment.openSelections).set(id, boundary);
    }
    events.push({ position: run.length, boundary });
  }

  function escaped(value: string, position: number, base: number, dual: boolean) {
    const character = value[position + 1];
    const allowed = dual ? "@<\\|{}>" : "@<\\|{}";
    if (character === undefined || !allowed.includes(character)) return fail("SCRIPT_ESCAPE", "Invalid Script escape.", base + position);
    return character;
  }

  function addAttribute(position: number, text: string, target: Annotation[], block: ReturnType<typeof readAttributes>) {
    if (!text || /\s$/u.test(text)) fail("SCRIPT_ATTRIBUTE_TARGET", "A word attribute must follow a display word.", position);
    target.push({ position: text.length, offset: position, attributes: block.attributes });
  }

  function dualSide(segment: Segment, value: string, base: number, side: "speech" | "display" | "shared") {
    let display = "";
    const marks: Annotation[] = [];
    for (let index = 0; index < value.length;) {
      const here = base + index;
      const char = value[index]!;
      if (char === "\\") {
        const literal = escaped(value, index, base, true);
        if (side === "display") display += literal;
        else run += literal;
        index += 2;
        continue;
      }
      if (char === "<" || char === "|" || char === "}") fail("SCRIPT_DUAL", "Expected literal Dual text.", here);
      if (char === "@") {
        const marker = temporalMarker.exec(value.slice(index));
        if (side === "display" || !marker) return fail("SCRIPT_DUAL_MARKER", "A Dual marker must address spoken words.", here);
        addMarker(segment, marker, here);
        index += marker[0].length;
        continue;
      }
      if (char === "{") {
        if (side === "speech") fail("SCRIPT_DUAL_ATTRIBUTE", "Dual attributes belong to its display text.", here);
        const block = readAttributes(value, index, (_code, message, at) => fail("SCRIPT_ATTRIBUTE", message, base + at));
        addAttribute(here, side === "display" ? display : run, side === "display" ? marks : annotations, block);
        index = block.next;
        continue;
      }
      if (side === "display") display += char;
      else run += char;
      index += 1;
    }
    return { display, marks: markDisplayWords(display, marks, fail) };
  }

  while (offset < source.length) {
    if (source.startsWith("<!--", offset)) {
      const close = source.indexOf("-->", offset + 4);
      if (close < 0) fail("SCRIPT_COMMENT", "Unclosed Script comment.", offset);
      offset = close + 3;
      continue;
    }

    const char = source[offset]!;
    if (current === undefined) {
      if (/\s/u.test(char)) { offset += 1; continue; }
      const open = segmentOpen.exec(source.slice(offset));
      if (!open) return fail("SCRIPT_SEGMENT_OPEN", "Expected a named Segment.", offset);
      const id = open[1]!;
      if (segments.has(id)) fail("SCRIPT_SEGMENT_DUPLICATE", `Repeated Segment ${id}.`, offset);
      current = { id, spokenWords: [], turns: [], regions: [], breaks: [], moments: new Map(),
        selections: new Map(), openSelections: new Map(), turn: { startWord: 0, offset }, pendingSpace: "" };
      offset += open[0].length;
      if (open[2] === "/") closeSegment(current);
      continue;
    }

    if (source.startsWith("</", offset)) {
      const close = segmentClose.exec(source.slice(offset));
      if (close?.[1] !== current.id) return fail("SCRIPT_SEGMENT_CLOSE", `Expected </${current.id}>.`, offset);
      offset += close[0].length;
      closeSegment(current);
      continue;
    }
    if (char === "<") {
      const end = unescaped(source, ">", offset + 1);
      if (end < 0) fail("SCRIPT_ANGLE", "Unclosed Script angle construct.", offset);
      const inside = source.slice(offset + 1, end);
      const pipe = unescaped(inside, "|", 0);
      flushRun(current, true);
      if (pipe < 0) {
        if (!roleLabel.test(inside)) fail("SCRIPT_ROLE", `Invalid speaker ${JSON.stringify(inside)}.`, offset);
        if (current.turn.role === undefined && current.spokenWords.length > 0) {
          fail("SCRIPT_ROLE_AFTER_TEXT", `The first speaker in ${current.id} must precede its spoken words.`, offset);
        }
        closeTurn(current);
        delete current.previousDisplay;
        current.pendingSpace = "";
        current.turn = { role: inside, startWord: current.spokenWords.length, offset };
      } else {
        const left = inside.slice(0, pipe);
        const right = inside.slice(pipe + 1);
        const shared = right.trim() === "";
        const display = shared ? undefined : dualSide(current, left, offset + 1, "display");
        dualSide(current, shared ? left : right, offset + (shared ? 1 : pipe + 2), shared ? "shared" : "speech");
        const text = display?.display ?? run;
        const { spoken, marks } = flushRun(current, false);
        if (spoken.startWord === spoken.endWordExclusive) fail("SCRIPT_DUAL_EMPTY", "A Dual must contain spoken words.", offset);
        if (text.trim()) appendRegion(current, text, spoken, true, display?.marks ?? marks);
      }
      offset = end + 1;
      continue;
    }
    if (char === "@") {
      const marker = temporalMarker.exec(source.slice(offset));
      if (!marker) return fail("SCRIPT_MARKER", "Expected a named marker.", offset);
      addMarker(current, marker, offset);
      offset += marker[0].length;
      continue;
    }
    if (source.startsWith("||", offset)) {
      const boundary = { word: current.spokenWords.length, offset };
      current.breaks.push(boundary);
      events.push({ position: run.length, boundary });
      offset += 2;
      continue;
    }
    if (char === "{") {
      const block = readAttributes(source, offset, fail);
      addAttribute(offset, run, annotations, block);
      offset = block.next;
      continue;
    }
    if (char === "\\") {
      run += escaped(source, offset, 0, false);
      offset += 2;
      continue;
    }
    run += char;
    offset += 1;
  }

  if (current !== undefined) fail("SCRIPT_SEGMENT_UNCLOSED", `Segment ${current.id} is not closed.`, offset);
  if (segments.size === 0) fail("SCRIPT_SEGMENT_OPEN", "Script requires at least one Segment.", offset);
  return { segments };
}
