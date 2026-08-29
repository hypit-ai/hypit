import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer-core";

import { compileHyperframesDocument, materializeHyperframesHtml } from "@hypit/hyperframes";
import type { ProgramSpace } from "@hypit/program-space";
import type { CompiledGraph } from "@hypit/protocol";
import { parseScript } from "@hypit/script";
import { videoCliDistribution } from "@hypit/video-cli";
import { loadStudioCompanionRegistry } from "@hypit/studio/src/companion-profile.js";
import { openStudioArchive } from "@hypit/studio/src/archive.js";
import { loadStudioDomain } from "@hypit/studio/src/domain.js";
import type { Preview } from "@hypit/studio/src/programme.js";
import { preview } from "@hypit/studio/src/programme.js";
import { loadStudioRun } from "@hypit/studio/src/run.js";
import { inspectStudioRun } from "@hypit/studio/src/studio-preflight.js";
import { realizePreviewMock } from "@hypit/preview-mock";
import { EndpointRegistry } from "@hypit/driver-node";
import { createLocalMediaProvider } from "@hypit/provider-media-local";

import { assert, ensureDir } from "./media.js";
import type { TranscriptFile } from "./types.js";

/** A frame range in the estimate-timed preview program, half-open in Script order. */
export type AuthoringWindow = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type StandInTiming = {
  readonly segment: string;
  readonly basis: "reference" | "estimate";
  readonly seconds: number;
  readonly frames: number;
  readonly tokens: number;
  readonly matched: number;
};

/** Which Segment the render is looking at, named directly or through a Selection's words. */
export type StandInFocus = {
  readonly segment?: string;
  readonly selection?: string;
  /**
   * A half-open range of the Script's own speech tokens.
   *
   * The finest thing worth looking at is not always a thing the Script named. A caption Cue is a run
   * of words ended by a speaker change or an authored break, and the planner picks it out by index —
   * so the index is what both sides take. `segment` and `selection` remain as the convenient way to
   * write down a range that does have a name.
   */
  readonly tokens?: readonly [number, number];
};

/**
 * A token window, read from whatever a caller supplied.
 *
 * The type says two numbers, and nothing but this checked that. A batch entry is JSON a caller wrote
 * by hand, so `"79:86"` arrives as a string, and destructuring one yields its first two characters:
 * `from` is `"7"` and `to` is `"9"`. Every guard downstream then compares strings — `"9" > "7"` holds,
 * and so does `"9" <= 135` once it coerces — so the window passes as valid and words 7 to 9 render
 * under the name of words 79 to 86. The call reports success, and the difference only shows up as a
 * comparison that makes no sense against a picture nobody asked for.
 */
export function tokenWindow(value: unknown, subject: string): readonly [number, number] {
  assert(Array.isArray(value) && value.length === 2 && value.every((item) => Number.isInteger(item)),
    `${subject} must be two whole numbers, as [from, to) — received ${JSON.stringify(value)}`);
  return [value[0] as number, value[1] as number];
}

function referenceTimed(
  segment: { readonly tokenStart: number; readonly tokenEndExclusive: number },
  pairs: ReadonlyMap<number, number>,
): boolean {
  for (let index = segment.tokenStart; index < segment.tokenEndExclusive; index += 1) {
    if (pairs.has(index)) return true;
  }
  return false;
}

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

export function repositoryRoot(): string {
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
 * A project's own packages are installed against the project, so a root taken from
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

/** The one active Script identity and body, preserved by preview realization. */
export function scriptBody(svml: string): { readonly id: string; readonly text: string; readonly offset: number } {
  const open = /<script\b[^>]*>/u.exec(svml);
  if (open === null) throw new Error("the Source declares no <script>");
  const id = /\bid="([^"]+)"/u.exec(open[0])?.[1];
  if (id === undefined || id.length === 0) throw new Error("the Source's <script> declares no id");
  const start = open.index + open[0].length;
  const end = svml.indexOf("</script>", start);
  if (end < 0) throw new Error("the Source's <script> is not closed");
  return { id, text: svml.slice(start, end), offset: start };
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
  //
  // A range given by index skips the lookup entirely: it is already the answer the other two forms
  // are resolved into, and it is the only form that can name a stretch the Script never marked.
  let from: number | undefined;
  let to: number | undefined;
  if (focus.tokens !== undefined) {
    [from, to] = tokenWindow(focus.tokens, "the token window");
    assert(from >= 0 && to > from && to <= parsed.tokens.length,
      `token range [${from}, ${to}) is outside the Script's ${parsed.tokens.length} words`);
  } else if (focus.selection !== undefined) {
    const selection = parsed.selections.find((item) => item.id === focus.selection);
    assert(selection !== undefined, `the Script marks no Selection ${focus.selection}`);
    from = selection.open.boundary.tokenIndex;
    to = selection.close.boundary.tokenIndex;
  } else {
    assert(focus.segment !== undefined, "name a Segment, a Selection or a token range to read a word range from");
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

  // Where the range closes, which has to be the second the render holds the last word until. A word
  // keeps the screen until the next one starts, so the pause the reference leaves between two words
  // belongs to the word before it; the estimate-timed SemanticTake preserves this same boundary
  // across a Segment boundary as well as inside one. Cutting the reference at the last word's own
  // end instead would leave it short of the render by that pause.
  //
  // The Script's last word has no next word to hold until, and closes on its own end. So does a word
  // whose next Segment the transcript carries none of: that Segment runs at the estimator's length,
  // the take before it was not sized to reach it, and the render closes where the words stop.
  const opener = parsed.segments.find((item) => end >= item.tokenStart && end < item.tokenEndExclusive);
  const holder = parsed.segments.find((item) => end - 1 >= item.tokenStart && end - 1 < item.tokenEndExclusive);
  const holdsOn = end < parsed.tokens.length
    && (opener === holder || (opener !== undefined && referenceTimed(opener, pairs)));
  const endSeconds = holdsOn ? spans[end]!.start : spans[end - 1]!.end;

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

/**
 * Do `work` once per key within this process, and let every later caller await that one run.
 *
 * A round asks for several windows of one program. Each entry is a whole call, so each would draw
 * the program again to throw most of it away, and each would write the mocks and the derived Run
 * again over the ones already there. Keyed by the same hash the working directory is, so entries
 * that share a directory share the one run that fills it. Between processes this holds nothing,
 * which is correct: a new process is the one case where the Source may have changed.
 */
const runningOnce = new Map<string, Promise<void>>();
async function once(key: string, work: () => Promise<void>): Promise<void> {
  const running = runningOnce.get(key);
  if (running !== undefined) return await running;
  const started = work();
  runningOnce.set(key, started);
  try { await started; } catch (error) { runningOnce.delete(key); throw error; }
}

export type RenderElementInput = {
  /**
   * A round of renders, run together. Each entry names its own element, stretch and output and
   * inherits `run` and `reference_id`. The full preview is realized and drawn once; entries then cut
   * their own windows from that shared frame cache in order.
   */
  readonly renders?: readonly RenderElementInput[];
  /** Required for one render; a round carries them per entry and inherits `run` from the outer input. */
  readonly run?: string;
  readonly element?: string;
  readonly out?: string;
  readonly segment?: string;
  readonly selection?: string;
  /** A half-open token range, for a stretch the Script never named. */
  readonly tokens?: readonly [number, number];
  /**
   * A reference used only for comparison evidence and reference window selection. It never changes
   * preview timing, which is always the Source's own `estimate:Speech` policy.
   */
  readonly reference_id?: string;
  /** Optional workspace root used by package-owned preview Sources. */
  readonly package_root?: string;
};

/** Timing metadata recorded beside one render, per Segment. */
export type StandInTimingReport = {
  readonly reference_id: string | null;
  /** Kept as a compatibility union; native preview realization always reports `estimate`. */
  readonly basis: "reference" | "estimate" | "mixed";
  readonly segments: readonly StandInTiming[];
};

/**
 * The record `render_element` leaves beside its output.
 *
 * A comparison is made from a file, and the file alone says nothing about what timed the picture in
 * it. Writing that beside the output means `compare_reconstruction` can copy it into the comparison
 * log without re-deriving preview timing.
 */
export type StandInSidecar = {
  readonly element: string;
  readonly window: AuthoringWindow;
  readonly timing_basis: "estimate";
  readonly timing: StandInTimingReport;
};

/** Where `render_element` writes the record of what timed a render. */
export function standInSidecarPath(outPath: string): string {
  return `${outPath}.stand-in.json`;
}

function timingReport(reference: string | undefined, segments: readonly StandInTiming[]): StandInTimingReport {
  return {
    reference_id: reference ?? null,
    basis: "estimate",
    segments,
  };
}

export type RealizedAuthoringPreview = {
  readonly runPath: string;
  readonly runRoot: string;
  readonly projectRoot: string;
  readonly packageRoot: string;
  readonly svmlPath: string;
  readonly svml: string;
  readonly built: Preview;
  readonly previewMock: Awaited<ReturnType<typeof realizePreviewMock>>;
  readonly programFrames: number;
  readonly frameOfToken: readonly { readonly frame: number; readonly end: number }[];
  readonly selections: ReadonlyMap<string, AuthoringWindow>;
  readonly segmentTokenCounts: ReadonlyMap<string, number>;
};

/**
 * Realize the Author + Run graph with deterministic preview mocks, without drawing or encoding media.
 * Layout inspection and render_element share this path so they inspect the same Producer output.
 */
export async function realizeAuthoringPreview(input: {
  readonly run: string;
  readonly runtime?: string;
  readonly package_root?: string;
}): Promise<RealizedAuthoringPreview> {
  const cwd = invokedFrom();
  const runPath = resolve(cwd, input.run);
  const runRoot = dirname(runPath);
  const projectRoot = input.package_root === undefined
    ? (nearestPackageRoot(runRoot) ?? repositoryRoot())
    : resolve(cwd, input.package_root);
  const packageRoot = projectRoot;
  const runSource = await readFile(runPath, "utf8").catch(() => undefined);
  assert(runSource !== undefined, `cannot read ${runPath}`);
  const author = /<author\s+source="([^"]+)"/u.exec(runSource)?.[1];
  assert(author !== undefined, `${input.run} declares no <author source="…"/>`);
  const svmlPath = resolve(runRoot, author);
  const svml = await readFile(svmlPath, "utf8").catch(() => undefined);
  assert(svml !== undefined, `cannot read ${svmlPath}`);

  const distributionPackageRoot = videoCliDistribution.packageRoot;
  if (distributionPackageRoot === undefined) throw new Error("active Hypit Distribution has no package root");
  const registry = await loadStudioCompanionRegistry({ workspaceRoot: projectRoot, packageRoot, distributionPackageRoot });
  const domain = await loadStudioDomain({ run: runPath, workspaceRoot: projectRoot, packageRoot });
  const runtimePath = input.runtime === undefined ? undefined : resolve(cwd, input.runtime);
  const archive = await openStudioArchive(runtimePath, packageRoot, projectRoot, distributionPackageRoot);
  try {
    const original = await loadStudioRun({ run: runPath, domain, registry, ...(archive === undefined ? {} : { archive }) });
    const graph: CompiledGraph = {
      format: "hypit.graph@1",
      outputs: original.source.compiled.graph.outputs,
      candidates: [...original.source.compiled.graph.candidates, ...original.run.graph.candidates],
      operations: [...original.source.compiled.graph.operations, ...original.run.graph.operations],
    };
    const aliases = new Map(original.source.exports.map((item) => [item.ref, item.name] as const));
    for (const record of original.source.compiled.program.records) {
      const local = original.source.compiled.provenance.elements.flatMap((element) => element.records)
        .find((item) => item.id === record.id)?.local ?? record.id.split("::record::")[1];
      if (local !== undefined) aliases.set(record.id, local);
    }
    const previewMock = await realizePreviewMock({
      run: runPath, graph, records: original.source.compiled.program.records,
      targets: original.targets, timing: "estimate", author, aliases,
    });
    const previewRegistry = await loadStudioCompanionRegistry({ workspaceRoot: projectRoot, packageRoot, distributionPackageRoot });
    const previewDomain = await loadStudioDomain({ run: previewMock.previewRun, workspaceRoot: projectRoot, packageRoot });
    const previewArchive = await openStudioArchive(runtimePath, packageRoot, projectRoot, distributionPackageRoot);
    try {
      const loadedPreview = await loadStudioRun({
        run: previewMock.previewRun, domain: previewDomain, registry: previewRegistry,
        ...(previewArchive === undefined ? {} : { archive: previewArchive }),
      });
      const previewRun = { ...loadedPreview, attachments: [...loadedPreview.attachments, ...previewMock.attachments] };
      const inspection = inspectStudioRun(previewRegistry, previewRun.source, previewRun, new Set([
        "@hypit/mock-media@1#render-mock-image",
        "@hypit/mock-media@1#render-mock-video",
        "@hypit/mock-media@1#render-mock-silence",
        "@hypit/media-pipeline@1#inspect-media",
        "@hypit/media-pipeline@1#normalize-media",
      ]));
      const deterministicEndpoints = new EndpointRegistry();
      await createLocalMediaProvider({}).install(deterministicEndpoints);
      const built = await preview({
        source: previewRun.source,
        run: previewRun,
        domain: previewDomain,
        outputRefs: [inspection.filmComposition, ...inspection.projections.map((item) => item.ref)],
        compositionRef: inspection.filmComposition,
        projections: inspection.projections,
        ...(previewArchive === undefined ? {} : { archive: previewArchive }),
        endpoints: deterministicEndpoints,
      });
      const programFrames = Math.max(1, ...built.anchors.values());
      const frameOfToken = built.tokens.map((token) => ({
        frame: built.anchors.get(token.startAnchorId) ?? 0,
        end: built.anchors.get(token.endAnchorId) ?? 0,
      }));
      const parsed = parseScript(svmlPath, scriptBody(svml).text, scriptBody(svml).offset);
      const cursor = (from: number, to: number): AuthoringWindow => ({
        startFrame: frameOfToken[from]?.frame ?? 0,
        endFrameExclusive: frameOfToken[to - 1]?.end ?? programFrames,
      });
      const selections = new Map<string, AuthoringWindow>();
      const segmentTokenCounts = new Map<string, number>();
      for (const segment of parsed.segments) {
        selections.set(`segment:${segment.id}`, cursor(segment.tokenStart, segment.tokenEndExclusive));
        segmentTokenCounts.set(segment.id, segment.tokenEndExclusive - segment.tokenStart);
      }
      for (const selection of parsed.selections) {
        selections.set(selection.id, cursor(selection.open.boundary.tokenIndex, selection.close.boundary.tokenIndex));
      }
      return {
        runPath, runRoot, projectRoot, packageRoot, svmlPath, svml, built, previewMock,
        programFrames, frameOfToken, selections, segmentTokenCounts,
      };
    } finally {
      await previewArchive?.close();
    }
  } catch (error) {
    const issues = (error as { readonly issues?: unknown } | null)?.issues;
    if (Array.isArray(issues)) {
      throw new Error(["the Source does not project yet.", ...issues.slice(0, 12).map((issue) => `  ${String(issue)}`)].join("\n"));
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    await archive?.close();
  }
}

/** Materialize a realized composition and its served artifacts without opening a browser. */
export async function stageAuthoringPreview(realized: Pick<RealizedAuthoringPreview, "built" | "previewMock">): Promise<{
  readonly stage: string;
  readonly document: ReturnType<typeof compileHyperframesDocument>;
  readonly mediaTypes: ReadonlyMap<string, string>;
}> {
  const stage = join(realized.previewMock.root, "stage");
  const document = compileHyperframesDocument(realized.built.composition, realized.built.space as ProgramSpace);
  await mkdir(stage, { recursive: true });
  const names = new Map<string, string>();
  const mediaTypes = new Map<string, string>();
  for (const [digest, file] of realized.built.served) {
    const extension = file.mediaType === "text/css" ? ".css"
      : file.mediaType === "application/javascript" || file.mediaType === "text/javascript" ? ".js"
        : "";
    const name = `${digest.replace(/[^a-z0-9]/giu, "")}${extension}`;
    await writeFile(join(stage, name), file.bytes);
    names.set(digest, name);
    mediaTypes.set(name, file.mediaType);
  }
  await writeFile(join(stage, "index.html"), materializeHyperframesHtml(document, (artifact) => {
    const name = names.get(artifact.digest);
    assert(name !== undefined, `the projection references Artifact ${artifact.digest}, which was not served`);
    return `./${name}`;
  }), "utf8");
  return { stage, document, mediaTypes };
}

/**
 * Render one element through the native preview realization path.
 *
 * The original Run is compiled once, its Author/Run Graph is handed to `@hypit/preview-mock`, and
 * the resulting temporary Run is previewed by Studio with only the local mock-media Provider. The
 * reference transcript remains comparison evidence; it never supplies preview timing.
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
  const outPath = resolve(cwd, out);
  // The directory the caller named, made rather than required. `out` is resolved against the working
  // directory the way `run` is, so a round whose entries name `renders/<element>.mp4` writes them
  // beside wherever it was launched from — and if nothing has created that directory, ffmpeg is the
  // one that reports it, as `Error opening output …: No such file or directory` against a path the
  // caller never typed.
  await ensureDir(dirname(outPath));

  // Preview is realized from the compiled Author + Run Graph. No reference transcript, placeholder
  // files, or hand-written SemanticTake values participate in this path.
  const segmentArgument = input.segment;
  const selectionArgument = input.selection;
  const tokensArgument = input.tokens === undefined ? undefined : tokenWindow(input.tokens, "tokens");
  const realized = await realizeAuthoringPreview({
    run,
    ...(input.package_root === undefined ? {} : { package_root: input.package_root }),
  });
  const {
    runPath, built, previewMock, programFrames, frameOfToken, selections, segmentTokenCounts,
  } = realized;
  const renderKey = createHash("sha256").update(`${resolve(runPath)}\u0000${input.reference_id ?? ""}`).digest("hex").slice(0, 12);
  const compareRoot = previewMock.root;
  const canvas = built.canvas;
  const frameRate = built.frameRate.numerator / built.frameRate.denominator;
  const timing: StandInTiming[] = [...selections.entries()]
    .filter(([id]) => id.startsWith("segment:"))
    .map(([id, window]) => ({ segment: id.slice("segment:".length), basis: "estimate", seconds: (window.endFrameExclusive - window.startFrame) / frameRate, frames: window.endFrameExclusive - window.startFrame, tokens: segmentTokenCounts.get(id.slice("segment:".length)) ?? 0, matched: 0 }));
  const mockedCount = previewMock.mocked.filter((item) => item.kind === "video" || item.kind === "audio").length;
  const imageIds = previewMock.mocked.filter((item) => item.kind === "image");
  const reference = undefined;
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
  if (tokensArgument !== undefined) {
    // A range given by index is the general form: a Segment and a Selection are both resolved into
    // one, and a Cue is a range that has no other way to be named.
    const [from, to] = tokensArgument;
    assert(from >= 0 && to > from && to <= frameOfToken.length,
      `token range [${from}, ${to}) is outside the Script's ${frameOfToken.length} words`);
    window = { startFrame: frameOfToken[from]!.frame, endFrameExclusive: frameOfToken[to - 1]!.end };
  } else if (selectionArgument !== undefined) {
    const marked = selections.get(selectionArgument);
    assert(marked !== undefined, `the Script marks no Selection ${selectionArgument}`);
    window = marked;
  } else if (segmentArgument !== undefined) {
    const marked = selections.get(`segment:${segmentArgument}`);
    assert(marked !== undefined, `the Script has no Segment ${segmentArgument}`);
    window = marked;
  }

  const clip = /\.(mp4|mov|webm)$/iu.test(outPath);
  const stage = join(compareRoot, "stage");
  const frames = join(compareRoot, "frames");
  // Staged and drawn once per Run and clock, however many windows are asked for.
  //
  // The picture does not depend on the element or the window — the whole program is drawn and the
  // window is cut out of these frames — so a round of eight looks over one Source is one browser
  // render and eight ffmpeg cuts. Rendering per entry would draw the same program eight times.
  //
  // The staged document is written inside the same run for the same reason the derived Run is: every
  // entry compiles the identical document to the identical path, `writeFile` truncates before it
  // writes, and the runtime is reading that path. An entry staging `index.html` while the runtime
  // loads it hands the runtime a file with no timeline in it, reported as
  // `Composition has zero duration`.
  await once(`draw:${renderKey}`, async () => {
    // Compile and materialize through the same no-media staging helper used by layout_check.
    await stageAuthoringPreview({ built, previewMock });

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
  });

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
  const sidecar: StandInSidecar = { element, window, timing_basis: "estimate", timing: report };
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
    mocked: { media: mockedCount, images: imageIds.length },
    ...(previewMock === undefined ? {} : { preview_mock: previewMock }),
  };
}

/**
 * Capture one package preview frame through the already-realized SVRun composition.
 *
 * This deliberately does not use HyperFrames' encoder: the normal SVRun → preview-mock → Producer
 * path has already produced the staged Composition, and a fixed local browser can seek that same
 * document directly.  Package previews therefore cost one browser frame rather than a complete PNG
 * sequence while retaining the exact runtime semantics.
 */
async function capturePreviewFrame(
  realized: Awaited<ReturnType<typeof realizeAuthoringPreview>>,
  frame: number,
  outPath: string,
): Promise<void> {
  const { stage, mediaTypes } = await stageAuthoringPreview(realized);
  const { serve, browserPath } = await import("./layout.js");
  const local = await serve(stage, mediaTypes);
  const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: realized.built.canvas.width, height: realized.built.canvas.height, deviceScaleFactor: 1 });
    await page.goto(local.url, { waitUntil: "load", timeout: 60_000 });
    await page.evaluate(() => {
      for (const root of Array.from(document.querySelectorAll("[data-composition-id][data-width][data-height]"))) {
        const width = Number(root.getAttribute("data-width"));
        const height = Number(root.getAttribute("data-height"));
        if (root instanceof HTMLElement && Number.isFinite(width) && Number.isFinite(height)) {
          root.style.width = `${width}px`;
          root.style.height = `${height}px`;
        }
      }
    });
    await page.evaluate(async () => { await document.fonts.ready; });
    const fps = realized.built.frameRate.numerator / realized.built.frameRate.denominator;
    await page.evaluate(async ({ frame: at, fps: rate }) => {
      const runtime = window as unknown as { __hf?: { seek?: (seconds: number) => unknown }; __player?: { renderSeek?: (seconds: number) => unknown } };
      const seconds = at / rate;
      const seek = runtime.__player?.renderSeek ?? runtime.__hf?.seek;
      if (typeof seek === "function") await seek.call(runtime.__player ?? runtime.__hf, seconds);
      else window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time: seconds } }));
      for (const clip of Array.from(document.querySelectorAll(".hypit-visual-present[data-start][data-duration]"))) {
        const start = Number(clip.getAttribute("data-start"));
        const duration = Number(clip.getAttribute("data-duration"));
        (clip as HTMLElement).style.display = seconds >= start && seconds < start + duration ? "" : "none";
      }
      await new Promise<void>((accept) => requestAnimationFrame(() => requestAnimationFrame(() => accept())));
    }, { frame, fps });
    const clip = await page.$eval("[data-composition-id]", (element) => {
      const rect = element.getBoundingClientRect();
      return { x: Math.max(0, rect.left), y: Math.max(0, rect.top), width: rect.width, height: rect.height };
    });
    await page.screenshot({ path: outPath, type: "png", clip });
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    await local.close().catch(() => undefined);
  }
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
    let realized: Awaited<ReturnType<typeof realizeAuthoringPreview>> | undefined;

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
        // Resolve the package from its workspace root rather than requiring a self-link under
        // packages/<slug>/node_modules. The preview Run still lives inside the package directory;
        // only dependency discovery needs the parent workspace.
        realized ??= await realizeAuthoringPreview({ run, package_root: dirname(dirname(packageDir)) });
        const placed = realized.built.tracks.find((track) => String(track.outputRef ?? "").endsWith(`::output::${element}.track`)
          || String(track.outputRef ?? "").includes(`::output::${element}.`));
        assert(placed !== undefined, `${directory} preview places no element named ${element}`);
        const trackId = (placed.value as { readonly id?: unknown } | null)?.id;
        assert(typeof trackId === "string", `${directory} preview element ${element} has no visual Track id`);
        const { stableFrameForTrack } = await import("./layout.js");
        const compositionTrack = realized.built.composition.tracks.find((track) => track.kind === "visual" && track.id === trackId);
        assert(compositionTrack !== undefined && compositionTrack.kind === "visual" && compositionTrack.presents.length > 0,
          `${directory} preview element ${element} has no visual Present`);
        const fallback = [...compositionTrack.presents].sort((left, right) => {
          const leftLength = left.span.endFrameExclusive - left.span.startFrame;
          const rightLength = right.span.endFrameExclusive - right.span.startFrame;
          return rightLength - leftLength || left.span.startFrame - right.span.startFrame || left.id.localeCompare(right.id);
        })[0]!;
        const frame = stableFrameForTrack(realized.built.composition, trackId)
          ?? fallback.span.startFrame + Math.floor((fallback.span.endFrameExclusive - fallback.span.startFrame - 1) / 2);
        await capturePreviewFrame(realized, frame, out);
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
