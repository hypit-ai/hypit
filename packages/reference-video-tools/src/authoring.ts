import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { writePlaceholder } from "./placeholder.js";
import { sliceSource } from "./slice.js";
import type { SliceResult } from "./slice.js";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compileHyperframesDocument, materializeHyperframesHtml } from "@hypit/hyperframes";
import {
  countSpeechEstimateUnits,
  estimateSpeechDuration,
  resolveSpeechEstimateLanguage,
  speechEstimatePolicyFromRecipe,
} from "@hypit/estimate";
import type { SpeechEstimatePolicy } from "@hypit/estimate";
import type { SynchronizedMedia } from "@hypit/media";
import type { ProgramSpace } from "@hypit/program-space";
import type { BlobRef, Digest } from "@hypit/protocol";
import { parseScript } from "@hypit/script";
import type { SemanticTake, SemanticTakeToken } from "@hypit/speech";
import { videoCliDistribution } from "@hypit/video-cli";
import { loadStudioAdapterRegistry } from "@hypit/studio/src/adapter-profile.js";
import { openStudioArchive } from "@hypit/studio/src/archive.js";
import { loadStudioDomain } from "@hypit/studio/src/domain.js";
import type { Preview } from "@hypit/studio/src/programme.js";
import { preview } from "@hypit/studio/src/programme.js";
import { loadStudioRun } from "@hypit/studio/src/run.js";
import { inspectStudioRun } from "@hypit/studio/src/studio-preflight.js";
import type { SvsRecipe } from "@hypit/svs";

import { assert, round } from "./media.js";
import type { TranscriptFile } from "./types.js";

/** A frame range of the stand-in program, half-open in the Script's own order. */
export type AuthoringWindow = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

/**
 * A stand-in Take. Its `media.audio` carries the sample count beside the Artifact, which is the
 * shape the `<value>` fixture is written with.
 */
export type StandInTakeValue = Omit<SemanticTake, "media"> & {
  readonly media: Omit<SynchronizedMedia, "audio"> & {
    readonly audio: { readonly artifact: BlobRef; readonly sampleFrames: number };
  };
};

export type StandInTake = {
  readonly segmentId: string;
  readonly startFrame: number;
  readonly take: StandInTakeValue;
};

/**
 * What timed one Segment's stand-in, and how long that clock said it runs.
 *
 * `seconds` is the clock's own answer. `frames` is what the Segment occupies in the program, which is
 * shorter for a Segment outside the window being drawn.
 */
export type StandInTiming = {
  readonly segment: string;
  readonly basis: "reference" | "estimate";
  readonly seconds: number;
  readonly frames: number;
  readonly tokens: number;
  /** Script words the reference's transcript matched. Zero on the estimate basis. */
  readonly matched: number;
};

export type StandInTakes = {
  readonly takes: readonly StandInTake[];
  readonly selections: ReadonlyMap<string, AuthoringWindow>;
  readonly frameCount: number;
  readonly timing: readonly StandInTiming[];
};

/** Which Segment the render is looking at, named directly or through a Selection's words. */
export type StandInFocus = {
  readonly segment?: string;
  readonly selection?: string;
};

/**
 * The Hypit tree this package is installed into.
 *
 * Studio's domain and the HyperFrames runtime are both found from it, and neither can be found from
 * the working directory: a command run from a project directory would resolve no packages, and one
 * that assumed the root would work there and crash anywhere else. Walking up from this module reaches
 * the tree from wherever the package was installed.
 *
 * What identifies it is holding the packages this module imports. A name in `package.json` does not:
 * a checkout and an installed Distribution carry different ones, so a check against either name
 * refuses the other, and the refusal reads as "this is not a Hypit checkout" while standing inside
 * one.
 */
const NEEDED = ["studio", "hyperframes", "script", "estimate"] as const;

function isHypitTree(directory: string): boolean {
  return NEEDED.every((name) => existsSync(join(directory, "packages", name, "package.json")));
}

function nearestTree(start: string): string | undefined {
  let directory = resolve(start);
  while (true) {
    if (isHypitTree(directory)) return directory;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function repositoryRoot(): string {
  // An explicit override is taken as given. Re-deriving it would refuse a layout the caller can see
  // and this cannot, which leaves no way out of a wrong guess.
  const override = process.env.HYPIT_REPOSITORY?.trim();
  if (override !== undefined && override.length > 0) {
    const directory = resolve(override);
    assert(existsSync(directory), `HYPIT_REPOSITORY names no directory: ${directory}`);
    return directory;
  }
  const found = nearestTree(dirname(fileURLToPath(import.meta.url))) ?? nearestTree(process.cwd());
  assert(found !== undefined,
    `no Hypit tree above ${dirname(fileURLToPath(import.meta.url))} or ${process.cwd()} — one holding packages/${NEEDED.join(", packages/")}. Set HYPIT_REPOSITORY to name it.`);
  return found;
}

/**
 * Where installed packages are resolved from, found the way `hypit check` finds it: the nearest
 * directory at or above the project that holds a `package.json`.
 *
 * A project's own `packages/local-*` are installed against the project, so a root taken from
 * anywhere else resolves none of them. This is the same walk `packages/cli/src/main.ts` performs,
 * and the reason a project is given a `package.json` of its own — without one the walk passes
 * through it and lands on the tree.
 */
export function nearestPackageRoot(start: string): string | undefined {
  let directory = resolve(start);
  while (true) {
    if (existsSync(join(directory, "package.json"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

/** Where a relative path on the command line is measured from. */
export function invokedFrom(): string {
  return process.cwd();
}

/** The Script body, which `parseScript` takes on its own. */
export function scriptBody(svml: string): { readonly text: string; readonly offset: number } {
  const open = /<script\b[^>]*>/u.exec(svml);
  if (open === null) throw new Error("the Source declares no <script>");
  const start = open.index + open[0].length;
  const end = svml.indexOf("</script>", start);
  if (end < 0) throw new Error("the Source's <script> is not closed");
  return { text: svml.slice(start, end), offset: start };
}

/**
 * What a Source calls each package it imports.
 *
 * These tools find elements by tag — `SemanticTake`, `Normalize`, `Canvas` — and a tag is written
 * behind whatever alias the Source chose in `<import as="…" from="…"/>`. The alias is the author's,
 * not the package's: two Sources importing one package under two names are the same Source as far as
 * anything downstream is concerned.
 *
 * Assuming the conventional alias is therefore a reading that is right until somebody writes
 * `as="speech-track"`, at which point the element is invisible and whatever depended on finding it
 * reports the Source as missing something it plainly has. So the alias is read from the Source, and
 * the conventional one is the fallback for a Source that imports without naming one.
 */
export function aliasPattern(svml: string, specifier: string, conventional: string): string {
  const found = new Set<string>();
  for (const match of svml.matchAll(/<import\s+([^>]*?)\/?>/gu)) {
    const attributes = match[1] ?? "";
    // The scope's own `@` is part of the name, so only the last one separates it from the version.
    const from = /\bfrom="(.+)@\d+"/u.exec(attributes)?.[1];
    if (from !== specifier) continue;
    found.add(/\bas="([^"]+)"/u.exec(attributes)?.[1] ?? conventional);
  }
  if (found.size === 0) found.add(conventional);
  // Longest first, so `speech-track` is not matched as `speech` followed by a stray `-track`.
  return [...found].sort((left, right) => right.length - left.length)
    .map((alias) => alias.replace(/[.*+?^${}()|[\]\\-]/gu, "\\$&")).join("|");
}

/** Every Recipe body in every sheet the Source imports, keyed `alias.path`. */
async function recipeSheets(svml: string, svmlPath: string): Promise<ReadonlyMap<string, SvsRecipe>> {
  const sheets = new Map<string, SvsRecipe>();
  for (const match of svml.matchAll(/<import\s+as="([^"]+)"\s+source="([^"]+\.svs)"/gu)) {
    const alias = match[1] ?? "";
    const source = match[2] ?? "";
    const text = await readFile(resolve(dirname(svmlPath), source), "utf8").catch(() => undefined);
    if (text === undefined) continue;
    for (const recipe of text.matchAll(/([A-Za-z0-9_.-]+)\s*\{([^}]*)\}/gu)) {
      const name = recipe[1] ?? "";
      const body = recipe[2] ?? "";
      const properties: Record<string, string | number> = {};
      for (const property of body.matchAll(/([a-z][a-z0-9-]*)\s*:\s*([^;]+);/gu)) {
        const key = property[1] ?? "";
        const value = (property[2] ?? "").trim();
        properties[key] = /^-?\d+(\.\d+)?$/u.test(value) ? Number(value) : value;
      }
      sheets.set(`${alias}.${name}`, { path: `${alias}.${name}`, properties });
    }
  }
  return sheets;
}

/**
 * The policy each Segment's duration was estimated with. A Source names it once per Segment through
 * `<estimate:Speech source={story.segment.NAME.speech} policy={recipes.X}/>`, and reading it back is
 * what keeps this on the Source's own basis rather than a second one.
 */
function policiesBySegment(svml: string, sheets: ReadonlyMap<string, SvsRecipe>): {
  readonly policies: ReadonlyMap<string, SpeechEstimatePolicy>;
  readonly shared: SpeechEstimatePolicy | undefined;
  readonly policyCount: number;
} {
  const policies = new Map<string, SpeechEstimatePolicy>();
  const named = new Set<string>();
  const estimate = aliasPattern(svml, "@hypit/estimate", "estimate");
  for (const match of svml.matchAll(new RegExp(`<(?:${estimate}):Speech\\b([^>]*?)/?>`, "gsu"))) {
    const attributes = match[1] ?? "";
    const segment = /\bsource=\{story\.segment\.([A-Za-z0-9_-]+)\.speech\}/u.exec(attributes)?.[1];
    const recipe = /\bpolicy=\{([A-Za-z0-9_.-]+)\}/u.exec(attributes)?.[1];
    if (segment === undefined || recipe === undefined) continue;
    const sheet = sheets.get(recipe);
    if (sheet === undefined) throw new Error(`policy Recipe ${recipe} is not in any imported sheet`);
    named.add(recipe);
    policies.set(segment, speechEstimatePolicyFromRecipe(sheet));
  }
  // A Segment whose take is shared with another Segment carries no estimate of its own, so it has no
  // policy named against it. One policy across the Source settles those; several leaves no basis to
  // pick from, and guessing would put a Segment on a pace the Source never chose for it.
  const shared = named.size === 1 ? policies.get([...policies.keys()][0]!) : undefined;
  return { policies, shared, policyCount: named.size };
}

const SILENT_AUDIO: BlobRef = { kind: "blob", digest: `sha256:${"0".repeat(64)}` as Digest, size: 1, mediaType: "audio/wav" };

/**
 * Build a stand-in SemanticTake for every Segment a Source declares.
 *
 * A Track timed against speech cannot be projected before the speech exists, and on this route it
 * does not exist: the Build has not run. Two clocks can stand in for it, and each Segment is sized by
 * whichever one can speak for it.
 *
 * **The reference's own words.** For a reconstruction, the words have already been spoken once and
 * timed: the Script was transcribed from the reference video, and `prepare_reference` wrote the
 * seconds of every word of it. A Segment timed this way runs for exactly as long as the reference
 * spends on those words, and every window inside it does too, which is what a progressive reveal, a
 * typewriter, a staggered row or an enter animation is compared on.
 *
 * **`estimate:Speech` with a policy Recipe.** The estimator the Source already trusts to size its own
 * generations. Running it here produces the same numbers the Source used to order its takes, so it
 * introduces no third clock; it reads one already written down. This is what sizes a Segment the
 * reference has nothing to say about, and what sizes every Segment when no reference is given.
 *
 * Word ranges and Recipe values are exact on either clock, so which elements are on screen together,
 * where each sits, at what size and colour follow from the Source itself. Alignment against the
 * speech a Build synthesizes is settled once that speech exists.
 *
 * @param svmlPath  the Author SVML this Source is written in
 * @param frameRate the Program's frame rate, as a whole number of frames per second
 * @param focus     which Segment the render is looking at
 * @param reference the reference's per-word times, from `referenceWords`
 * @returns one `{ segmentId, take }` per Segment in Script order, and what timed each of them
 */
/** The Segment a Selection is marked in, so a window named by Selection can still name the cut. */
function segmentOfSelection(svml: string, selection: string | undefined): string | undefined {
  if (selection === undefined) return undefined;
  const open = /<script\b[^>]*>/u.exec(svml);
  if (open === null) return undefined;
  const start = open.index + open[0].length;
  const end = svml.indexOf("</script>", start);
  if (end < 0) return undefined;
  const body = svml.slice(start, end);
  const at = body.indexOf(`@${selection}`);
  if (at < 0) return undefined;
  let found: string | undefined;
  for (const match of body.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*>/gu)) {
    if (match.index > at) break;
    if (body.indexOf(`</${match[1]!}>`, match.index) > at) found = match[1]!;
  }
  return found;
}

/**
 * The Author SVML a Run declares, both as it is written and as a path.
 *
 * Studio's unit of work is the Run, so everything on this route is handed one and reads the Source
 * back out of it. `declared` is what the Run wrote, which a derived Run has to repoint.
 */
export async function authorSource(runPath: string): Promise<{ readonly path: string; readonly declared: string }> {
  const runSource = await readFile(runPath, "utf8").catch(() => undefined);
  assert(runSource !== undefined, `cannot read ${runPath}`);
  const declared = /<author\s+source="([^"]+)"/u.exec(runSource)?.[1];
  assert(declared !== undefined, `${runPath} declares no <author source="…"/>`);
  return { path: resolve(dirname(runPath), declared), declared };
}

/** One word of a reference's transcript, at the seconds the reference speaks it. */
export type ReferenceWord = {
  readonly text: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
};

/** Where `prepare_reference` writes a reference's per-word times. */
export function referenceRoot(): string {
  return join(repositoryRoot(), ".hypit", "reference-video-tools");
}

/**
 * The per-word times a prepared reference was transcribed to, in the order it speaks them.
 *
 * Words the aligner left untimed are dropped: a word with no seconds against it cannot anchor
 * anything, and carrying it would shift every index after it away from the clock.
 */
export async function referenceWords(reference: string): Promise<readonly ReferenceWord[]> {
  const path = join(referenceRoot(), reference, "transcript.json");
  const text = await readFile(path, "utf8").catch(() => undefined);
  assert(text !== undefined, `reference ${reference} has no transcript at ${path}; run prepare_reference first`);
  const file = JSON.parse(text) as TranscriptFile;
  const words = file.passages.flatMap((passage) => passage.words).flatMap((word) =>
    word.start_seconds === undefined || word.end_seconds === undefined
      ? []
      : [{ text: word.text, startSeconds: word.start_seconds, endSeconds: word.end_seconds }]);
  assert(words.length > 0, `reference ${reference} has a transcript with no timed words`);
  return words;
}

/** Lowercase letters and digits only, so `AI,` and `ai` are the same word and `11 labs` is two. */
function normalizeWord(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

type MatchingBlock = { readonly left: number; readonly right: number; readonly size: number };

/**
 * The longest run of words that appears in both sequences, within the given ranges.
 *
 * `lengths` carries, for each position in the right sequence, how long a run ends there against the
 * word just read from the left. Reading one left word at a time turns the whole search into two
 * passes rather than a comparison of every pair.
 */
function longestRun(
  left: readonly string[], right: readonly string[],
  leftFrom: number, leftTo: number, rightFrom: number, rightTo: number,
  positions: ReadonlyMap<string, readonly number[]>,
): MatchingBlock {
  let bestLeft = leftFrom;
  let bestRight = rightFrom;
  let bestSize = 0;
  let lengths = new Map<number, number>();
  for (let index = leftFrom; index < leftTo; index += 1) {
    const next = new Map<number, number>();
    for (const at of positions.get(left[index]!) ?? []) {
      if (at < rightFrom) continue;
      if (at >= rightTo) break;
      const run = (lengths.get(at - 1) ?? 0) + 1;
      next.set(at, run);
      if (run > bestSize) {
        bestSize = run;
        bestLeft = index - run + 1;
        bestRight = at - run + 1;
      }
    }
    lengths = next;
  }
  return { left: bestLeft, right: bestRight, size: bestSize };
}

/**
 * Which Script word is which transcript word, as runs that appear in both in the same order.
 *
 * The two sequences say the same thing and are not the same list. A transcriber writes `11 labs`
 * where the Script writes `elevenlabs`, splits a word in two, or hears one that is not there, and a
 * single insertion is enough to put a positional pairing a word out for the whole rest of the
 * reference — on this project it drops the pairing from 96% of words to 41%. So the two are aligned:
 * the longest run common to both is taken as fixed, and the stretches on either side of it are
 * aligned the same way, down to the words that do not appear on both sides. Anchoring on runs rather
 * than on single words is what keeps a common word like `the` from pairing with a `the` elsewhere in
 * the reference.
 */
function alignWords(script: readonly string[], reference: readonly string[]): ReadonlyMap<number, number> {
  const positions = new Map<string, number[]>();
  for (const [index, word] of reference.entries()) {
    const seen = positions.get(word);
    if (seen === undefined) positions.set(word, [index]);
    else seen.push(index);
  }
  const pairs = new Map<number, number>();
  const pending: (readonly [number, number, number, number])[] = [[0, script.length, 0, reference.length]];
  while (pending.length > 0) {
    const [leftFrom, leftTo, rightFrom, rightTo] = pending.pop()!;
    const block = longestRun(script, reference, leftFrom, leftTo, rightFrom, rightTo, positions);
    if (block.size === 0) continue;
    for (let step = 0; step < block.size; step += 1) pairs.set(block.left + step, block.right + step);
    if (leftFrom < block.left && rightFrom < block.right) pending.push([leftFrom, block.left, rightFrom, block.right]);
    const leftEnd = block.left + block.size;
    const rightEnd = block.right + block.size;
    if (leftEnd < leftTo && rightEnd < rightTo) pending.push([leftEnd, leftTo, rightEnd, rightTo]);
  }
  return pairs;
}

type WordSpan = { readonly start: number; readonly end: number };

/**
 * A time for every Script word, from the ones that matched.
 *
 * A matched word takes the seconds the reference speaks it at. A run of unmatched words is spread
 * evenly across the stretch between the matched words on either side of it — the reference was
 * saying something there, and what it was saying is the run. A run at either end of the Script has a
 * matched word on one side only, so it takes the reference words immediately outside that one, at a
 * word apiece.
 */
function wordSpans(count: number, pairs: ReadonlyMap<number, number>, reference: readonly ReferenceWord[]): readonly WordSpan[] {
  const anchors = [...pairs.keys()].sort((left, right) => left - right);
  const spans: WordSpan[] = new Array(count) as WordSpan[];
  for (const index of anchors) {
    const word = reference[pairs.get(index)!]!;
    spans[index] = { start: word.startSeconds, end: word.endSeconds };
  }
  for (let position = 0; position <= anchors.length; position += 1) {
    const before = position === 0 ? undefined : anchors[position - 1]!;
    const after = position === anchors.length ? undefined : anchors[position]!;
    const from = before === undefined ? 0 : before + 1;
    const to = after === undefined ? count : after;
    if (from >= to) continue;
    const run = to - from;
    let start: number;
    let end: number;
    if (before !== undefined && after !== undefined) {
      start = reference[pairs.get(before)!]!.endSeconds;
      end = reference[pairs.get(after)!]!.startSeconds;
    } else if (after !== undefined) {
      const at = pairs.get(after)!;
      start = reference[Math.max(0, at - run)]!.startSeconds;
      end = reference[at]!.startSeconds;
    } else {
      const at = pairs.get(before!)!;
      start = reference[at]!.endSeconds;
      end = reference[Math.min(reference.length - 1, at + run)]!.endSeconds;
    }
    const step = (end - start) / run;
    for (let offset = 0; offset < run; offset += 1) {
      spans[from + offset] = { start: start + step * offset, end: start + step * (offset + 1) };
    }
  }
  return spans;
}

/**
 * The stretch of a reference that speaks one Segment's or one Selection's words.
 *
 * A render covers a word range; a shot is a cut in the picture. The two are unrelated stretches of
 * the same video, and a Segment routinely runs across five of them. So a comparison against the
 * reference finds its stretch the way every other window on this route is found — the Script's own
 * tokens, aligned against the transcript — and reads the seconds off the words it lands on.
 *
 * `first` and `last` carry the end words' own spans, which is what an end can be moved inside of
 * without the range gaining or losing a whole word.
 */
export type SpokenRange = {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly first: ReferenceWord;
  readonly last: ReferenceWord;
  readonly words: number;
  /** How many of those words the transcript carries. The rest take their seconds from `wordSpans`. */
  readonly matched: number;
};

export async function spokenRange(
  svmlPath: string,
  focus: StandInFocus,
  reference: readonly ReferenceWord[],
): Promise<SpokenRange> {
  const svml = await readFile(svmlPath, "utf8");
  const body = scriptBody(svml);
  const parsed = parseScript(svmlPath, body.text, body.offset);

  // Which Script words the range covers. A Selection is marked once, so its word range is the
  // tokens between the anchors its open and close markers name.
  let from: number | undefined;
  let to: number | undefined;
  if (focus.selection !== undefined) {
    const selection = parsed.selections.find((item) => item.id === focus.selection);
    assert(selection !== undefined, `the Script marks no Selection ${focus.selection}`);
    from = selection.open.boundary.tokenIndex;
    to = selection.close.boundary.tokenIndex;
  } else {
    assert(focus.segment !== undefined, "name a Segment or a Selection to read a word range from");
    const segment = parsed.segments.find((item) => item.id === focus.segment);
    assert(segment !== undefined, `the Script has no Segment ${focus.segment}`);
    from = segment.tokenStart;
    to = segment.tokenEndExclusive;
  }
  const start = from ?? 0;
  const end = to ?? 0;
  assert(start < end, `${focus.selection ?? focus.segment} covers no words`);

  const pairs = alignWords(
    parsed.tokens.map((token) => normalizeWord(token.text)),
    reference.map((word) => normalizeWord(word.text)));
  let matched = 0;
  for (let index = start; index < end; index += 1) if (pairs.has(index)) matched += 1;
  // Without a matched word inside the range, its seconds are an interpolation between whatever the
  // reference was saying on either side of it, which is a stretch of the video nobody asked for.
  assert(matched > 0,
    `the reference's transcript carries none of the words of ${focus.selection ?? focus.segment}, so the seconds it spoke them at are unknown`);

  const spans = wordSpans(parsed.tokens.length, pairs, reference);

  // Where the range closes. A render gives each word the screen until the next one starts, so the
  // pause the reference leaves between two words belongs to the word before it and a Take covers its
  // Segment without holes — `standInTakes` says why. A Selection closing part-way through a Segment
  // is therefore drawn up to the next word's start, and cutting the reference at the last word's end
  // instead leaves the reference short of the render by that pause. The Segment's own last word has
  // no next word inside it and closes on its own end, which is the length the take was given.
  const holder = parsed.segments.find((item) => end - 1 >= item.tokenStart && end - 1 < item.tokenEndExclusive);
  const closesMidSegment = holder !== undefined && end < holder.tokenEndExclusive;
  const endSeconds = closesMidSegment ? spans[end]!.start : spans[end - 1]!.end;

  const word = (index: number, until = spans[index]!.end): ReferenceWord => ({
    text: parsed.tokens[index]!.text,
    startSeconds: spans[index]!.start,
    endSeconds: until,
  });
  return {
    startSeconds: spans[start]!.start,
    endSeconds,
    first: word(start),
    // The end word carries the same close, so moving the end onto a shot boundary inside it looks at
    // the seconds the render actually drew rather than a shorter word.
    last: word(end - 1, endSeconds),
    words: end - start,
    matched,
  };
}

export async function standInTakes(
  svmlPath: string,
  frameRate: number,
  focus: StandInFocus = {},
  reference: readonly ReferenceWord[] = [],
  timingSource: string = svmlPath,
): Promise<StandInTakes> {
  const svml = await readFile(svmlPath, "utf8");
  const body = scriptBody(svml);
  const parsed = parseScript(svmlPath, body.text, body.offset);

  // Which Script the reference is aligned against. A render is drawn from a fragment holding one
  // Segment, and aligning that fragment's words against the whole transcript is not the same
  // alignment the whole Script produces: a word that matched inside a longer run of context stops
  // matching, and the unmatched runs at the fragment's own two ends are interpolated from the words
  // just outside them rather than from the neighbouring Segments. The comparison reads the whole
  // Source, so a render timed from the fragment covers seconds the comparison never cuts.
  //
  // So the alignment is made once, against the whole Source, and each Segment takes its own slice out
  // of it by id. The fragment is a byte-for-byte cut, so a Segment holds the same words in both.
  const timed = timingSource === svmlPath
    ? parsed
    : await (async () => {
      const text = await readFile(timingSource, "utf8");
      const whole = scriptBody(text);
      return parseScript(timingSource, whole.text, whole.offset);
    })();
  const sheets = await recipeSheets(svml, svmlPath);
  const { policies, shared, policyCount } = policiesBySegment(svml, sheets);

  // Which Segment the render is actually looking at. Every other Segment still has to exist — a
  // Speech Track assembles one Take per Segment and an unsatisfied one refuses the whole projection —
  // but nothing needs it at its estimated length. Held to one frame per word it stays legal, keeps
  // its anchors, and stops the renderer drawing a minute of program to show six seconds of it.
  let focused: string | undefined;
  if (focus.segment !== undefined) focused = focus.segment;
  else if (focus.selection !== undefined) {
    const selection = parsed.selections.find((item) => item.id === focus.selection);
    const token = selection?.open.boundary.tokenIndex;
    focused = token === undefined
      ? undefined
      : parsed.segments.find((segment) => token >= segment.tokenStart && token < segment.tokenEndExclusive)?.id;
  }

  // Which Script word the reference speaks when. The Script was transcribed from that video, so the
  // words are the same words in the same order, and a stand-in timed from them runs at the pace the
  // reconstruction is being compared against.
  const words = reference.length === 0
    ? undefined
    : (() => {
      const pairs = alignWords(timed.tokens.map((token) => normalizeWord(token.text)), reference.map((word) => normalizeWord(word.text)));
      return pairs.size === 0 ? undefined : { pairs, spans: wordSpans(timed.tokens.length, pairs, reference) };
    })();

  const takes: StandInTake[] = [];
  const timing: StandInTiming[] = [];
  // Global frame span of every word, in Script order, so a Selection can be turned into a frame
  // range without going near a clock. This is the correspondence the route uses everywhere else:
  // a stretch of the reference is found by its words, and its words are where the Script says.
  const frameOfToken: { readonly frame: number; readonly end: number }[] = [];
  let frameCursor = 0;
  for (const segment of parsed.segments) {
    const tokens = parsed.tokens.slice(segment.tokenStart, segment.tokenEndExclusive);
    const text = tokens.map((token) => token.text).join(" ");

    // A Segment is timed from the reference when the reference was heard saying some of its words.
    // The decision is made per Segment: an ordinary transcription difference costs one Segment its
    // reference clock and leaves the rest of the Script on it.
    const whole = timed.segments.find((item) => item.id === segment.id);
    let matched = 0;
    if (words !== undefined && whole !== undefined) {
      for (let index = whole.tokenStart; index < whole.tokenEndExclusive; index += 1) if (words.pairs.has(index)) matched += 1;
    }
    const spoken = words === undefined || whole === undefined || matched === 0
      ? undefined
      : words.spans.slice(whole.tokenStart, whole.tokenEndExclusive);

    // How long the Segment runs. The reference's own words when it was heard saying them, the
    // estimator the Source already trusts when it was not.
    let seconds: number;
    let basis: StandInTiming["basis"];
    let weights: readonly number[] | undefined;
    if (spoken !== undefined) {
      seconds = Math.max(0, spoken.at(-1)!.end - spoken[0]!.start);
      basis = "reference";
    } else {
      const policy = policies.get(segment.id) ?? shared;
      if (policy === undefined) {
        throw new Error(`Segment ${segment.id} names no estimate:Speech policy, and the Source uses ${policyCount} policies, so there is no single one to fall back to`);
      }
      seconds = estimateSpeechDuration({ value: text }, policy);
      basis = "estimate";
      const language = resolveSpeechEstimateLanguage(text, policy.language);
      weights = tokens.map((token) => Math.max(1, countSpeechEstimateUnits(token.text, language)));
    }

    const frameCount = focused !== undefined && segment.id !== focused
      ? Math.max(1, tokens.length)
      : Math.max(tokens.length, Math.round(seconds * frameRate));
    timing.push({ segment: segment.id, basis, seconds: round(seconds), frames: frameCount, tokens: tokens.length, matched });

    // Where each word ends. On the reference clock a word holds the screen until the next one starts
    // and the last holds until the reference stops saying it, so the small gaps the reference leaves
    // between words go to the word before them and the Take covers its Segment without holes. On the
    // estimate the share is the estimator's own unit count, so the word order and the relative widths
    // both come from the same place the duration did.
    const total = weights?.reduce((sum, weight) => sum + weight, 0) ?? 0;
    const edge = spoken !== undefined
      ? (index: number, start: number): number =>
        Math.max(start + 1, Math.round((spoken[index + 1]!.start - spoken[0]!.start) * frameRate))
      : (index: number, start: number): number =>
        start + Math.max(1, Math.round(frameCount * weights![index]! / total));

    const anchors: { readonly identity: string; readonly frame: number }[] = [
      { identity: `segment:${segment.id}:start`, frame: 0 },
      { identity: `segment:${segment.id}:end`, frame: frameCount },
    ];
    const placed: SemanticTakeToken[] = [];
    let used = 0;
    for (const [index, token] of tokens.entries()) {
      const start = used;
      // The last token closes the Segment exactly, so rounding never leaves a frame unclaimed, and
      // every earlier one is held back far enough that the ones after it still get a frame each.
      used = index === tokens.length - 1
        ? frameCount
        : Math.min(frameCount - (tokens.length - 1 - index), edge(index, start));
      const id = `segment:${segment.id}:token:${index + 1}`;
      placed.push({
        tokenId: id, segmentId: segment.id, text: token.text,
        startAnchorId: `${id}:start`, endAnchorId: `${id}:end`,
        startFrame: start, endFrameExclusive: used,
      });
      anchors.push({ identity: `${id}:start`, frame: start }, { identity: `${id}:end`, frame: used });
    }

    frameOfToken.push(...placed.map((token) => ({ frame: frameCursor + token.startFrame, end: frameCursor + token.endFrameExclusive })));
    takes.push({
      segmentId: segment.id,
      startFrame: frameCursor,
      take: {
        media: {
          timeline: { frameRate: { numerator: frameRate, denominator: 1 }, frameCount },
          audio: { artifact: SILENT_AUDIO, sampleFrames: Math.round(frameCount / frameRate * 48_000) },
        },
        segment: {
          segmentId: segment.id,
          startAnchorId: `segment:${segment.id}:start`,
          endAnchorId: `segment:${segment.id}:end`,
          startFrame: 0,
          endFrameExclusive: frameCount,
        },
        tokens: placed,
        anchors,
      },
    });
    frameCursor += frameCount;
  }

  // Every Selection the Script marks, as the frames its words occupy. Selections nest freely, so a
  // window runs from the frame of its open anchor's word to the end of the word before its close.
  const selections = new Map<string, AuthoringWindow>();
  for (const selection of parsed.selections) {
    const first = frameOfToken[selection.open.boundary.tokenIndex];
    const last = frameOfToken[selection.close.boundary.tokenIndex - 1];
    if (first === undefined || last === undefined) continue;
    if (first.frame < last.end) selections.set(selection.id, { startFrame: first.frame, endFrameExclusive: last.end });
  }
  return { takes, selections, frameCount: frameCursor, timing };
}

function blobRef(bytes: Uint8Array, mediaType: string): BlobRef {
  return { kind: "blob", digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, size: bytes.byteLength, mediaType };
}

/** 48 kHz mono PCM silence, written by hand so the mock needs no encoder and lands on exact bytes. */
function silentWav(sampleFrames: number): Buffer {
  const data = Math.max(2, sampleFrames * 2);
  const buffer = Buffer.alloc(44 + data);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + data, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(48_000, 24);
  buffer.writeUInt32LE(48_000 * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(data, 40);
  return buffer;
}

export type RenderElementInput = {
  /**
   * A round of renders, run together. Each entry names its own element, stretch and output and
   * inherits `run` and `reference_id`. The route renders every element before it compares any, and
   * each render is now written under its own directory, so a round has nothing to serialise for.
   */
  readonly renders?: readonly RenderElementInput[];
  /** Required for one render; a round carries them per entry and inherits `run` from the outer input. */
  readonly run?: string;
  readonly element?: string;
  readonly out?: string;
  readonly segment?: string;
  readonly selection?: string;
  /**
   * A prepared reference to time the stand-in from. Its transcript holds the seconds each word was
   * spoken at, and the Script was transcribed from that video, so the stand-in runs at the pace the
   * render is compared against. Without one the Source's own `estimate:Speech` sizes each Segment.
   */
  readonly reference_id?: string;
};

/** What timed the stand-in behind one render, per Segment. */
export type StandInTimingReport = {
  readonly reference_id: string | null;
  /** `mixed` when some Segments were timed from the reference and others fell back to the estimate. */
  readonly basis: "reference" | "estimate" | "mixed";
  readonly segments: readonly StandInTiming[];
};

/**
 * The record `render_element` leaves beside its output.
 *
 * A comparison is made from a file, and the file alone says nothing about what timed the picture in
 * it. Writing that beside the output means `compare_reconstruction` can copy it into the comparison
 * log from the path it was handed, and the gate can report which comparisons were made at the
 * reference's pace without re-deriving anything.
 */
export type StandInSidecar = {
  readonly element: string;
  readonly window: AuthoringWindow;
  readonly timing: StandInTimingReport;
};

/** Where `render_element` writes the record of what timed a render. */
export function standInSidecarPath(outPath: string): string {
  return `${outPath}.stand-in.json`;
}

function timingReport(reference: string | undefined, segments: readonly StandInTiming[]): StandInTimingReport {
  const bases = new Set(segments.map((item) => item.basis));
  return {
    reference_id: reference ?? null,
    basis: bases.size > 1 ? "mixed" : segments.some((item) => item.basis === "reference") ? "reference" : "estimate",
    segments,
  };
}

/**
 * Render one element of a Source the way that Source configures it, without a Build and without a
 * Provider.
 *
 * `comparison-round.md` compares a reconstructed element against the reference. What it must
 * compare is the element as this video places it — the Recipe values the Source passes, the Script
 * text it feeds, the windows it binds — because a Source can fill those with values that collide
 * while a package's catalogue preview, drawn from sample values, stays perfect. Producing that
 * picture by hand means transcribing values into a per-package harness, one line at a time, which is
 * how a caption system gets compared as a single line that has nothing to collide with.
 *
 * So this reads the values instead. Everything it needs is already written down:
 *
 *   Canvas and Frames, Recipe values, bindings   the Source
 *   which elements share a window, in what order  the Script's words, through their Selections
 *   how long each Segment runs                    the reference's own words, or `estimate:Speech`
 *   the layers a Build has not made               `make-placeholder`, sized from the Canvas
 *
 * The one thing missing before a Build is real speech, and `standInTakes` supplies a Segment
 * skeleton for it. Given `reference_id` it reads the seconds out of that reference's transcript, so
 * every window is as long as the reference spends on the words inside it; without one it reads the
 * estimator the Source already trusts, the same numbers it ordered its takes with. Those takes enter
 * through `<value>` and `<satisfy>`, the mechanism `examples/all-components-preview` uses to open in
 * Studio without spending anything, so nothing here is a private back door into the graph.
 *
 * What this settles: which elements are on screen together, where each sits, at what size, weight and
 * colour, and — on a reference-timed stand-in — how long each of them has to arrive in. What it does
 * not: alignment against the speech a Build synthesizes, which is settled once that speech
 * exists. `timing` in the result, and the sidecar written
 * beside the output, name which of the two clocks sized each Segment.
 */
export async function renderElement(input: RenderElementInput): Promise<Record<string, unknown>> {
  // A round carries these per entry; one render has to name all three itself.
  assert(input.run !== undefined, "run is required");
  assert(input.element !== undefined, "element is required");
  assert(input.out !== undefined, "out is required");
  const element = input.element;
  const out = input.out;
  const run = input.run;
  const cwd = invokedFrom();
  const runPath = resolve(cwd, run);
  const projectRoot = dirname(runPath);
  // Where installed packages are found, which is not where the Hypit tree is. A project carries its
  // own `packages/local-*`, so the search starts at the project and walks up the way the CLI's does —
  // resolving against the tree instead would miss every package the project installed for itself.
  const packageRoot = nearestPackageRoot(projectRoot) ?? repositoryRoot();
  const outPath = resolve(cwd, out);

  const runSource = await readFile(runPath, "utf8").catch(() => undefined);
  assert(runSource !== undefined, `cannot read ${runPath}`);
  const author = /<author\s+source="([^"]+)"/u.exec(runSource)?.[1];
  assert(author !== undefined, `${run} declares no <author source="…"/>`);
  const svmlPath = resolve(projectRoot, author);
  let svml = await readFile(svmlPath, "utf8").catch(() => undefined);
  assert(svml !== undefined, `cannot read ${svmlPath}`);

  // The Program's frame rate and the Canvas the render composes at, both read rather than assumed. A
  // harness that hard-codes either produces a picture at a geometry the reference never had.
  const clock = /<[a-z-]*:?Clock\b[^>]*?\bframe-rate="(\d+)"/su.exec(svml)?.[1]
    ?? /<time:Clock\b[^>]*?\bfps="(\d+)"/su.exec(svml)?.[1];
  const frameRate = Number(clock ?? 30);
  const space = aliasPattern(svml, "@hypit/spatial", "space");
  const canvasMatch = new RegExp(`<(?:${space}):Canvas\\b[^>]*?\\bwidth="(\\d+)"[^>]*?\\bheight="(\\d+)"`, "su").exec(svml);
  assert(canvasMatch !== null, `the Source declares no <${space.split("|")[0]}:Canvas width= height=/>`);
  const canvas = { width: Number(canvasMatch[1]), height: Number(canvasMatch[2]) };

  // Which SemanticTake output belongs to which Segment, so each stand-in lands on the right one.
  const whisperx = aliasPattern(svml, "@hypit/whisperx", "whisperx");
  const takeOutputs = new Map<string, string>();
  for (const match of svml.matchAll(new RegExp(`<(?:${whisperx}):SemanticTake\\b([^>]*?)/?>`, "gsu"))) {
    const attributes = match[1] ?? "";
    const id = /\bid="([^"]+)"/u.exec(attributes)?.[1];
    const segment = /\bsegment=\{story\.segment\.([A-Za-z0-9_-]+)\}/u.exec(attributes)?.[1];
    if (id !== undefined && segment !== undefined) takeOutputs.set(segment, id);
  }
  assert(takeOutputs.size > 0, `the Source declares no ${whisperx.split("|")[0]}:SemanticTake to stand in for`);

  // What the Run already brings. A project Run declares nothing and everything is mocked; a package's
  // preview Run ships its own sample pictures, and those are carried across untouched so the catalogue
  // picture shows the component holding something rather than a placeholder.
  const alreadySatisfied = new Set([...runSource.matchAll(/<satisfy\s+output="([^"]+)"/gu)].map((match) => match[1] ?? ""));
  const carried = [...runSource.matchAll(/^[ \t]*<(?:file|value|satisfy)\b[^>]*\/>[ \t]*$/gmu)].map((match) => (match[0] ?? "").trim());

  // The window is resolved before the stand-ins are built, so the program is only as long as the
  // stretch being looked at. Rendering the whole program to crop six seconds out of it is the
  // difference between a few seconds and a few minutes.
  const segmentArgument = input.segment;
  const selectionArgument = input.selection;
  const focus = {
    ...(segmentArgument === undefined ? {} : { segment: segmentArgument }),
    ...(selectionArgument === undefined ? {} : { selection: selectionArgument }),
  };

  // The derived Run is written here, and so is the cut, so the directory comes first.
  // One directory per render, named for what this render is. Every call used to write one shared
  // `.hypit/compare` and empty it on the way in, so two renders could not run at once — the second
  // deleted the first one's sliced Source and mocks out from under it. The route asks for every
  // element to be rendered before any is compared, which is a set of renders with nothing to say to
  // each other, and they can now run together.
  const renderKey = createHash("sha256")
    .update(`${resolve(out)}\u0000${element}\u0000${focus.segment ?? focus.selection ?? ""}`)
    .digest("hex").slice(0, 12);
  const compareRoot = join(projectRoot, ".hypit", "compare", renderKey);
  await rm(compareRoot, { recursive: true, force: true });
  await mkdir(compareRoot, { recursive: true });

  // With a window named, the Source is cut down to it before anything else runs. Every Segment
  // outside it would otherwise still be drawn — held to one frame per word, which is the shortest a
  // Take can legally be, and still nearly half the frames. The cut is byte-for-byte from the
  // original, so the fragment cannot say anything the Source does not; `slice.ts` explains what
  // decides which elements come with it.
  let sourcePath = svmlPath;
  let sliced: SliceResult | undefined;
  const focusedSegment = focus.segment ?? segmentOfSelection(svml, focus.selection);
  if (focusedSegment !== undefined) {
    sliced = sliceSource(svml, focusedSegment);
    sourcePath = join(compareRoot, "sliced.svml");
    // The fragment sits three directories below the Source it came from, so its own relative paths
    // have to reach back the same distance the derived Run's carried files do.
    //
    // `src` belongs in this list beside the import attributes. It is how the author's own supplied
    // material is named — a presenter still, a voice sample — and left alone it resolved against the
    // fragment's directory, where there is no `assets/`. Every Source carrying a `media:Image` with a
    // relative path failed to render at all, on either route, the moment a window was named.
    const repointed = sliced.text.replace(/(\s(?:source|from|src)=")\.\//gu, "$1../../../");
    await writeFile(sourcePath, repointed, "utf8");
    // Everything downstream reads the Source: which Takes to stand in for, which media to mock, which
    // outputs to satisfy. Left on the original it would declare mocks for elements the cut removed,
    // and a `<satisfy>` naming an output that no longer exists is refused.
    svml = repointed;
  }

  // The reference's per-word times, when one was named. Read after the cut so a transcript that is
  // missing is reported before a minute of rendering rather than after it.
  const reference = input.reference_id?.trim();
  const spoken = reference === undefined || reference.length === 0 ? [] : await referenceWords(reference);

  const { takes, selections, frameCount: programFrames, timing } = await standInTakes(sourcePath, frameRate, focus, spoken, svmlPath);
  const framesBySegment = new Map(takes.map((item) => [item.segmentId, item.take.segment.endFrameExclusive]));
  // A Selection's window in frames, summed over the stand-in tokens it covers. This is the same word
  // span the Source binds to, carried into frames by the same clock that sized the Segment.
  const framesBySelection = new Map<string, number>();
  for (const { segmentId, take } of takes) {
    for (const token of take.tokens) framesBySelection.set(token.tokenId, token.endFrameExclusive - token.startFrame);
    framesBySelection.set(`segment:${segmentId}`, take.segment.endFrameExclusive);
  }

  /**
   * Every media a Build would have produced, and how long its window is. A speech take carries no
   * picture and a base take fills a Segment; a cutaway fills whatever its `during=` binds. Each becomes
   * a placeholder of the Canvas's own size, so the composite has the geometry the Source declares.
   */
  const mockedMedia = (): ReadonlyMap<string, { readonly frames: number; readonly picture: boolean }> => {
    const windows = new Map<string, number>();
    for (const match of svml.matchAll(new RegExp(`<(?:${whisperx}):SemanticTake\\b([^>]*?)/?>`, "gsu"))) {
      const attributes = match[1] ?? "";
      const media = /\bmedia=\{([A-Za-z0-9_-]+)\.media\}/u.exec(attributes)?.[1];
      const segment = /\bsegment=\{story\.segment\.([A-Za-z0-9_-]+)\}/u.exec(attributes)?.[1];
      if (media !== undefined && segment !== undefined) windows.set(media, framesBySegment.get(segment) ?? frameRate);
    }
    for (const match of svml.matchAll(/<[a-z][a-z0-9-]*:[A-Za-z][A-Za-z0-9]*\b([^>]*?)\/?>/gsu)) {
      const attributes = match[1] ?? "";
      const media = /\bmedia=\{([A-Za-z0-9_-]+)\.media\}/u.exec(attributes)?.[1];
      if (media === undefined || windows.has(media)) continue;
      const segment = /\bduring=\{story\.segment\.([A-Za-z0-9_-]+)\}/u.exec(attributes)?.[1];
      if (segment !== undefined) { windows.set(media, framesBySegment.get(segment) ?? frameRate); continue; }
      // A cutaway's window is the Selection it is bound to, which the stand-in already measured in
      // frames. A mock shorter than its window runs out inside it, and with `playback` at its default
      // the frames after that draw nothing — a gap the Source never wrote, appearing only in the
      // comparison, in exactly the shape of the defect the comparison is looking for.
      const selection = /\bduring=\{story\.selection\.([A-Za-z0-9_-]+)\}/u.exec(attributes)?.[1];
      const window = selection === undefined ? undefined : selections.get(selection);
      windows.set(media, window === undefined
        ? frameRate
        : window.endFrameExclusive - window.startFrame);
    }
    const carries = new Map<string, { readonly frames: number; readonly picture: boolean }>();
    const pipeline = aliasPattern(svml, "@hypit/media-pipeline", "pipeline");
    for (const match of svml.matchAll(new RegExp(`<(?:${pipeline}):Normalize\\b([^>]*?)/?>`, "gsu"))) {
      const attributes = match[1] ?? "";
      const id = /\bid="([^"]+)"/u.exec(attributes)?.[1];
      const video = /\bvideo="([^"]+)"/u.exec(attributes)?.[1];
      if (id === undefined || !windows.has(id)) continue;
      // A Run that already satisfies this output brought its own material — a package's preview Source
      // supplies sample pictures this way — and a mock over the top would hide what it came to show.
      if (alreadySatisfied.has(`${id}.media`)) continue;
      carries.set(id, { frames: windows.get(id)!, picture: video !== "none" });
    }
    return carries;
  };

  // A derived Run lives beside the project so the original's relative sources still resolve, and under
  // `.hypit/` so it is never mistaken for something the author wrote. It is rewritten every run.
  const declarations: string[] = [];
  const satisfactions: string[] = [];
  for (const { segmentId, take } of takes) {
    const output = takeOutputs.get(segmentId);
    if (output === undefined) continue;
    // The take's own audio has to be servable, not a digest stub: Studio resolves every Artifact a
    // projection references, and a preview that cannot serve one stops there.
    const sampleFrames = Math.round(take.segment.endFrameExclusive / frameRate * 48_000);
    const silence = silentWav(sampleFrames);
    await writeFile(join(compareRoot, `${segmentId}-take.wav`), silence);
    const spoken = { ...take, media: { ...take.media, audio: { artifact: blobRef(silence, "audio/wav"), sampleFrames } } };
    const fixture = join(compareRoot, `${segmentId}.json`);
    await writeFile(fixture, `${JSON.stringify({ kind: "inline", value: spoken }, null, 2)}\n`, "utf8");
    declarations.push(`  <file id="stand-in-${segmentId}-audio" type="@hypit/artifact@1#BlobArtifact" from="./${segmentId}-take.wav" media-type="audio/wav"/>`);
    declarations.push(`  <value id="stand-in-${segmentId}" type="@hypit/speech@1#SemanticTake" from="./${segmentId}.json"/>`);
    satisfactions.push(`  <satisfy output="${output}.take" candidate="stand-in-${segmentId}"/>`);
  }
  // The layers a Build has not made, as placeholders of the Canvas's own size. `make-placeholder` is
  // the route's one tool for this: deterministic, Provider-free, and the same mock the comparison is
  // told to bypass. A mock never enters the project's own Source — it is declared in the derived Run
  // and nowhere else.
  // Every picture mock at once. Each one is a solid fill, so they do not contend for anything but
  // ffmpeg, and drawn one after another they cost more than every frame they stand in for.
  const mocks = [...mockedMedia()];
  await Promise.all(mocks
    .filter(([, { picture }]) => picture)
    .map(async ([id, { frames }]) => await writePlaceholder({
      out: join(compareRoot, `${id}.mp4`), width: canvas.width, height: canvas.height,
      video: true, seconds: Math.max(1, Math.ceil(frames / frameRate)), color: "mid",
    })));
  for (const [id, { frames, picture }] of mocks) {
    const file = join(compareRoot, `${id}.mp4`);
    // Every SynchronizedMedia carries audio, and it is validated as WAV, so the silence is written as
    // one rather than pointed at the video. Both are declared: the picture is what gets drawn, the
    // silence is what makes the value legal.
    const wavPath = join(compareRoot, `${id}.wav`);
    const wav = silentWav(Math.round(frames / frameRate * 48_000));
    await writeFile(wavPath, wav);
    const audioBlob = blobRef(wav, "audio/wav");
    declarations.push(`  <file id="mock-${id}-audio" type="@hypit/artifact@1#BlobArtifact" from="./${id}.wav" media-type="audio/wav"/>`);
    let visual: SynchronizedMedia["visual"];
    if (picture) {
      const bytes = await readFile(file);
      visual = { artifact: blobRef(bytes, "video/mp4"), width: canvas.width, height: canvas.height };
      declarations.push(`  <file id="mock-${id}" type="@hypit/artifact@1#BlobArtifact" from="./${id}.mp4" media-type="video/mp4"/>`);
    }
    const media: SynchronizedMedia = {
      timeline: { frameRate: { numerator: frameRate, denominator: 1 }, frameCount: frames },
      audio: { artifact: audioBlob },
      ...(visual === undefined ? {} : { visual }),
    };
    await writeFile(join(compareRoot, `${id}.media.json`), `${JSON.stringify({ kind: "inline", value: media }, null, 2)}\n`, "utf8");
    declarations.push(`  <value id="media-${id}" type="@hypit/media@1#SynchronizedMedia" from="./${id}.media.json"/>`);
    satisfactions.push(`  <satisfy output="${id}.media" candidate="media-${id}"/>`);
  }

  // Still images the Source declares as generations. Same treatment, same tool, at the Canvas's size:
  // a picture slot that is empty in the render is black, and black is not what will be there.
  const imageIds = [...new Set([...svml.matchAll(/\{([a-z0-9-]+)\.image\}/gu)].map((match) => match[1] ?? ""))]
    .filter((id) => !alreadySatisfied.has(`${id}.image`));
  await Promise.all(imageIds.map(async (id) => await writePlaceholder({
    out: join(compareRoot, `${id}.png`), width: canvas.width, height: canvas.height, color: "mid",
  })));
  for (const id of imageIds) {
    declarations.push(`  <file id="mock-${id}" type="@hypit/artifact@1#BlobArtifact" from="./${id}.png" media-type="image/png"/>`);
    satisfactions.push(`  <satisfy output="${id}.image" candidate="mock-${id}"/>`);
  }

  const derivedRun = join(compareRoot, "compare.svrun");
  await writeFile(derivedRun, [
    `<?svml using="@hypit/run-markup@1"?>`,
    ``,
    `<svrun version="1">`,
    // The cut, when there was one: it sits beside this Run, and its own imports were repointed to
    // reach the project from here.
    sliced === undefined
      ? `  <author source="../../${author.replace(/^\.\//u, "")}"/>`
      : `  <author source="./sliced.svml"/>`,
    // Whatever the Run brought, repointed: the derived Run sits two directories deeper than the one
    // that declared these paths.
    ...carried.map((line) => `  ${line.replace(/from="\.\//gu, 'from="../../')}`),
    // Targeting the element's own output rather than the Film prunes the closure to what this one
    // Track needs. Asking for the whole delivery would pull in every generation the Source declares
    // and report each as unresolved, which is true and useless: none of them is what is being looked at.
    `  <target output="final.video"/>`,
    ``,
    ...declarations,
    ``,
    ...satisfactions,
    `</svrun>`,
    ``,
  ].join("\n"), "utf8");

  const distributionPackageRoot = videoCliDistribution.packageRoot;
  if (distributionPackageRoot === undefined) throw new Error("active Hypit Distribution has no package root");

  const registry = await loadStudioAdapterRegistry({ workspaceRoot: projectRoot, packageRoot, distributionPackageRoot });
  const domain = await loadStudioDomain({ run: derivedRun, workspaceRoot: projectRoot, packageRoot });
  const archive = await openStudioArchive(undefined, packageRoot, projectRoot, distributionPackageRoot);
  let built: Preview;
  try {
    const run = await loadStudioRun({ run: derivedRun, domain, ...(archive === undefined ? {} : { archive }) });
    const inspection = inspectStudioRun(registry, run.source, run);
    // Every Track, not only the one being looked at: the element is compared where it sits, over the
    // mocked base rather than on its own, because text that is legible on black may not be on a picture.
    built = await preview({
      source: run.source,
      run,
      domain,
      outputRefs: [inspection.filmComposition, ...inspection.projections.map((item) => item.ref)],
      compositionRef: inspection.filmComposition,
      projections: inspection.projections,
      ...(archive === undefined ? {} : { archive }),
    });
  } catch (error) {
    const issues = (error as { readonly issues?: unknown } | null)?.issues;
    if (Array.isArray(issues)) {
      throw new Error(["the Source does not project yet.", ...issues.slice(0, 12).map((issue) => `  ${String(issue)}`)].join("\n"));
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  const placed = built.tracks.find((track) => String(track.outputRef ?? "").endsWith(`::output::${element}.track`)
    || String(track.outputRef ?? "").includes(`::output::${element}.`));
  if (placed === undefined) {
    // An output is named `<id>.<output>`, and --element takes the id on its own. Listing the outputs
    // would hand the reader a name that fails the same way the one they passed did, so the last part
    // is dropped and one element placed twice is named once.
    const ids = [...new Set(built.tracks.map((track) => {
      const output = String(track.outputRef ?? "").split("::output::")[1];
      return output === undefined ? track.name : output.replace(/\.[^.]*$/u, "");
    }))];
    throw new Error([
      `the Source places no element named ${element}. --element takes the bare id, and these are placed:`,
      ...ids.map((id) => `  ${id}`),
    ].join("\n"));
  }

  // The window to render, named in words. A shot of the reference is found by the words spoken over it
  // and those words are a Segment or a Selection here, so no reference timestamp is ever read across.
  let window: AuthoringWindow = { startFrame: 0, endFrameExclusive: programFrames };
  if (selectionArgument !== undefined) {
    const marked = selections.get(selectionArgument);
    assert(marked !== undefined, `the Script marks no Selection ${selectionArgument}`);
    window = marked;
  } else if (segmentArgument !== undefined) {
    let cursor = 0;
    const take = takes.find((item) => { const hit = item.segmentId === segmentArgument; if (!hit) cursor += item.take.segment.endFrameExclusive; return hit; });
    assert(take !== undefined, `the Script has no Segment ${segmentArgument}`);
    window = { startFrame: cursor, endFrameExclusive: cursor + take.take.segment.endFrameExclusive };
  }

  // Compile once, materialize with the artifact bytes written beside the document, and let the
  // HyperFrames runtime draw it. This is the path packages/hyperframes/test/browser-visual.test.ts
  // takes; nothing here is a private renderer.
  const document = compileHyperframesDocument(built.composition, built.space as ProgramSpace);
  const stage = join(compareRoot, "stage");
  await mkdir(stage, { recursive: true });
  const names = new Map<string, string>();
  for (const [digest, file] of built.served) {
    const name = `${digest.replace(/[^a-z0-9]/giu, "")}`;
    await writeFile(join(stage, name), file.bytes);
    names.set(digest, name);
  }
  await writeFile(join(stage, "index.html"), materializeHyperframesHtml(document, (artifact) => {
    const name = names.get(artifact.digest);
    assert(name !== undefined, `the projection references Artifact ${artifact.digest}, which was not served`);
    return `./${name}`;
  }), "utf8");

  const clip = /\.(mp4|mov|webm)$/iu.test(outPath);
  const frames = join(compareRoot, "frames");
  await rm(frames, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });
  // The runtime ships with the tree, not with the project. Resolving it against the package root
  // finds nothing whenever those two differ, which is every project that installs packages of its own.
  const hyperframesCli = createRequire(join(repositoryRoot(), "packages/provider-hyperframes-local/package.json"))
    .resolve("hyperframes/bin/hyperframes.mjs");
  const drawn = spawnSync(process.execPath, [
    hyperframesCli, "render", stage,
    "--format", "png-sequence", "--output", frames, "--fps", String(frameRate),
    "--workers", String(Math.max(1, cpus().length - 2)),
    // Halves the time and lands on the same pixels — verified frame for frame against a run without
    // it, PSNR reporting no error at all. The flag is marked experimental upstream; that is the
    // reason to check the pixels, which is done, rather than the reason to draw twice as long.
    "--experimental-fast-capture", "--no-best-effort", "--quiet",
  ], { encoding: "utf8", windowsHide: true, timeout: 600_000 });
  assert(drawn.status === 0, `the HyperFrames runtime refused: ${(drawn.stderr ?? "").trim().slice(-2000)}`);

  const written = (await readdir(frames)).filter((name) => name.endsWith(".png")).sort();
  assert(written.length > 0, "the HyperFrames runtime wrote no frames");
  const first = Math.min(window.startFrame, written.length - 1);
  const last = Math.min(window.endFrameExclusive, written.length);
  // The runtime draws with an alpha channel and leaves unpainted area transparent. What a viewer is
  // under is the Film's own clear colour, so it is composited in here rather than left to whatever
  // opens the file: a reference clip is opaque, and an observer handed a transparent counterpart reads
  // the difference as design when it came from the encoding.
  const clear = built.canvas?.clearColor ?? "#000000";
  const background = `color=c=${clear.replace("#", "0x")}:s=${canvas.width}x${canvas.height}:r=${frameRate}`;
  const count = Math.max(1, clip ? last - first : 1);
  const encoded = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", background,
    "-framerate", String(frameRate), "-start_number", String(clip ? first : Math.min(first + Math.floor((last - first) / 2), written.length - 1)),
    "-i", join(frames, "frame_%06d.png"),
    "-filter_complex", "[0][1]overlay=shortest=1[v]", "-map", "[v]",
    "-frames:v", String(count),
    ...(clip ? ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20"] : []),
    outPath,
  ], { encoding: "utf8", windowsHide: true, timeout: 600_000 });
  assert(encoded.status === 0, `ffmpeg refused: ${(encoded.stderr ?? "").trim().slice(-2000)}`);

  // What timed this picture, written where the picture is. `compare_reconstruction` is handed a path
  // and nothing else, so this is how the comparison log comes to say whether the stretch it looked at
  // ran at the reference's pace or at an estimate of it.
  const report = timingReport(reference, timing);
  const sidecar: StandInSidecar = { element, window, timing: report };
  await writeFile(standInSidecarPath(outPath), `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");

  return {
    element,
    out: outPath,
    compared: clip ? "clip" : "still",
    canvas,
    frame_rate: frameRate,
    window,
    program_frames: programFrames,
    timing: report,
    stand_in_ref: standInSidecarPath(outPath),
    mocked: { media: mockedMedia().size, images: imageIds.length },
  };
}

export type RenderPreviewsInput = {
  readonly package_dirs: readonly string[];
};

/**
 * Draw a package's catalogue preview images from the package's own preview Source.
 *
 * A Manifest hands Studio and the README a picture per Surface, read off disk with `readFile`. Those
 * pictures were made once and committed, and nothing could make them again: a Recipe could change, a
 * Surface could gain a port, and the catalogue would go on showing what the package used to draw.
 *
 * So the sample lives in the package as a Source it can be drawn from. `preview/preview.svml`,
 * `preview/recipes.svs` and `preview/build.svrun` hold the package's own copy, its own Recipe values
 * and its own Canvas — nothing about any project — and `renderElement` draws them through the
 * real authoring path. A Surface that stopped working cannot produce a preview that looks fine.
 *
 * Which element draws which file comes from the Manifest's own naming: a Surface tagged `Track`
 * declares `preview/Track.png`, so `Track.png` is drawn from whichever element in the preview Source
 * carries that tag. No third file has to agree with the other two.
 */
export async function renderPreviews(input: RenderPreviewsInput): Promise<Record<string, unknown>> {
  const directories = input.package_dirs;
  assert(directories.length > 0, "package_dirs must name at least one package directory");

  const cwd = invokedFrom();
  const pictures: Record<string, unknown>[] = [];
  let written = 0;
  for (const directory of directories) {
    const packageDir = resolve(cwd, directory);
    const previewDir = join(packageDir, "preview");
    const run = join(previewDir, "build.svrun");
    const svml = await readFile(join(previewDir, "preview.svml"), "utf8").catch(() => undefined);
    assert(svml !== undefined,
      `${directory} has no preview/preview.svml. Write one: the package's own copy, its own Recipe values, its own Canvas.`);

    // The alias the preview Source imports this package under. A preview Source places Tracks from
    // several packages — it needs a semantic spine and a Film like any other — and `Track` is a common
    // tag, so the tag alone would draw whichever one happened to be written first.
    const manifestJson = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8").catch(() => "{}")) as { readonly name?: unknown };
    const specifier = manifestJson.name;
    assert(typeof specifier === "string", `${directory} has no package.json name`);
    const imported = [...svml.matchAll(/<import\s+as="([^"]+)"\s+from="(@[^"]+)@\d+"/gu)];
    const alias = imported.find((match) => match[2] === specifier)?.[1];
    assert(alias !== undefined,
      `${directory}'s preview Source does not import ${specifier}, so nothing in it is this package's`);

    // The pictures the Manifest promises, and the element tag each one is named for.
    const manifest = await readFile(join(packageDir, "src", "manifest.ts"), "utf8").catch(() => "");
    const promised = [...new Set([...manifest.matchAll(/previewImage\(\s*["']([^"']+)["']/gu)].map((match) => match[1] ?? ""))];
    const existing = (await readdir(previewDir).catch(() => [] as string[]))
      .filter((name) => /\.(png|jpe?g|svg)$/iu.test(name));
    const promisedPictures = promised.length > 0 ? promised : existing;
    assert(promisedPictures.length > 0, `${directory} promises no preview picture; nothing to draw`);

    for (const picture of promisedPictures) {
      if (/\.svg$/iu.test(picture)) {
        // Drawn by hand, not from a Source.
        pictures.push({ package_dir: directory, picture, drawn: false, reason: "drawn by hand, not from a Source" });
        continue;
      }
      const tag = basename(picture).replace(/\.[^.]+$/u, "");
      const element = new RegExp(`<${alias}:${tag}\\b[^>]*?\\bid="([^"]+)"`, "su").exec(svml)?.[1];
      assert(element !== undefined,
        `${directory} promises ${picture} but its preview Source places no <${alias}:${tag}> to draw it from`);
      const out = join(previewDir, picture);
      try {
        await renderElement({ run, element, out });
      } catch (error) {
        throw new Error(`${directory} could not draw ${picture}: ${error instanceof Error ? error.message : String(error)}`);
      }
      // A catalogue picture is compared against nothing, so the record of what timed it is dropped
      // rather than committed beside the package's own pictures.
      await rm(standInSidecarPath(out), { force: true });
      pictures.push({ package_dir: directory, picture, drawn: true, tag, element, out });
      written += 1;
    }
  }
  return { package_dirs: directories, drew: written, pictures };
}
