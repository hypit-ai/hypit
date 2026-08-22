import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
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
import { openStudioArchive } from "@hypit/studio/src/archive.js";
import { loadStudioDomain } from "@hypit/studio/src/domain.js";
import type { Preview } from "@hypit/studio/src/programme.js";
import { preview } from "@hypit/studio/src/programme.js";
import { loadStudioRun } from "@hypit/studio/src/run.js";
import { inspectStudioRun } from "@hypit/studio/src/studio-preflight.js";
import type { SvsRecipe } from "@hypit/svs";

import { assert } from "./media.js";

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

export type StandInTakes = {
  readonly takes: readonly StandInTake[];
  readonly selections: ReadonlyMap<string, AuthoringWindow>;
  readonly frameCount: number;
};

/** Which Segment the render is looking at, named directly or through a Selection's words. */
export type StandInFocus = {
  readonly segment?: string;
  readonly selection?: string;
};

/**
 * The Hypit checkout this package is installed into.
 *
 * Studio's domain and the HyperFrames runtime are both found from it, and neither can be found from
 * the working directory: a command run from a project directory would resolve no packages, and one
 * that assumed the root would work there and crash anywhere else, on a missing module rather than on
 * anything a reader could act on. Walking up from this module reaches the checkout from wherever the
 * package was installed. `HYPIT_REPOSITORY` names one explicitly, the same override
 * `locate-repository.mjs` reads.
 */
function isCheckout(directory: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as { readonly name?: string };
    return manifest.name === "@hypit/repository";
  } catch { return false; }
}

function nearestCheckout(start: string): string | undefined {
  let directory = resolve(start);
  while (true) {
    if (isCheckout(directory)) return directory;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function repositoryRoot(): string {
  const override = process.env.HYPIT_REPOSITORY?.trim();
  if (override !== undefined && override.length > 0) {
    const directory = resolve(override);
    assert(isCheckout(directory), `HYPIT_REPOSITORY is not a Hypit checkout: ${directory}`);
    return directory;
  }
  const found = nearestCheckout(dirname(fileURLToPath(import.meta.url))) ?? nearestCheckout(process.cwd());
  assert(found !== undefined, "no Hypit checkout above this package or the working directory; set HYPIT_REPOSITORY");
  return found;
}

/** Where a relative path on the command line is measured from. */
export function invokedFrom(): string {
  return process.env.INIT_CWD ?? process.cwd();
}

/** The Script body, which `parseScript` takes on its own. */
function scriptBody(svml: string): { readonly text: string; readonly offset: number } {
  const open = /<script\b[^>]*>/u.exec(svml);
  if (open === null) throw new Error("the Source declares no <script>");
  const start = open.index + open[0].length;
  const end = svml.indexOf("</script>", start);
  if (end < 0) throw new Error("the Source's <script> is not closed");
  return { text: svml.slice(start, end), offset: start };
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
  for (const match of svml.matchAll(/<estimate:Speech\b([^>]*?)\/?>/gsu)) {
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
 * Build a stand-in SemanticTake for every Segment a Source declares, from the Source alone.
 *
 * A Track timed against speech cannot be projected before the speech exists, and on this route it
 * does not exist: the Build has not run. What the Source does hold is the words themselves and the
 * estimator it already trusts to size its own generations — `estimate:Speech` with a policy Recipe.
 * Running that estimator here produces the same numbers the Source used to order its takes, so this
 * introduces no second clock; it reads the one already written down.
 *
 * What the result is good for: which elements are on screen together, where each sits, at what size
 * and colour. Those follow from word ranges and Recipe values and are exact. What it is not good for
 * is real timing — the delivered speech is not the estimate, and anything measured in seconds waits
 * for `production-gates.md` Gate 3.
 *
 * Tokens are laid across the Segment in proportion to the same syllable count the estimator uses, so
 * a long word occupies more of the window than a short one and the ordering is the Script's.
 *
 * @param svmlPath  the Author SVML this Source is written in
 * @param frameRate the Program's frame rate, as a whole number of frames per second
 * @returns one `{ segmentId, take }` per Segment, in Script order
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

export async function standInTakes(svmlPath: string, frameRate: number, focus: StandInFocus = {}): Promise<StandInTakes> {
  const svml = await readFile(svmlPath, "utf8");
  const body = scriptBody(svml);
  const parsed = parseScript(svmlPath, body.text, body.offset);
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
    const token = selection?.occurrences[0]?.open.boundary.tokenIndex;
    focused = token === undefined
      ? undefined
      : parsed.segments.find((segment) => token >= segment.tokenStart && token < segment.tokenEndExclusive)?.id;
  }

  const takes: StandInTake[] = [];
  // Global frame span of every word, in Script order, so a Selection can be turned into a frame
  // range without going near a clock. This is the correspondence the route uses everywhere else:
  // a stretch of the reference is found by its words, and its words are where the Script says.
  const frameOfToken: { readonly frame: number; readonly end: number }[] = [];
  let frameCursor = 0;
  for (const segment of parsed.segments) {
    const policy = policies.get(segment.id) ?? shared;
    if (policy === undefined) {
      throw new Error(`Segment ${segment.id} names no estimate:Speech policy, and the Source uses ${policyCount} policies, so there is no single one to fall back to`);
    }
    const tokens = parsed.tokens.slice(segment.tokenStart, segment.tokenEndExclusive);
    const text = tokens.map((token) => token.text).join(" ");
    const seconds = estimateSpeechDuration({ value: text }, policy);
    const frameCount = focused !== undefined && segment.id !== focused
      ? Math.max(1, tokens.length)
      : Math.max(tokens.length, Math.round(seconds * frameRate));

    // Share the Segment's frames out by the estimator's own unit count, so the word order and the
    // relative widths both come from the same place the duration did.
    const language = resolveSpeechEstimateLanguage(text, policy.language);
    const weights = tokens.map((token) => Math.max(1, countSpeechEstimateUnits(token.text, language)));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const anchors: { readonly identity: string; readonly frame: number }[] = [
      { identity: `segment:${segment.id}:start`, frame: 0 },
      { identity: `segment:${segment.id}:end`, frame: frameCount },
    ];
    const placed: SemanticTakeToken[] = [];
    let used = 0;
    for (const [index, token] of tokens.entries()) {
      const start = used;
      // The last token closes the Segment exactly, so rounding never leaves a frame unclaimed.
      used = index === tokens.length - 1
        ? frameCount
        : Math.min(frameCount - (tokens.length - 1 - index), start + Math.max(1, Math.round(frameCount * weights[index]! / total)));
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

  // Every Selection the Script marks, as the frames its words occupy. Occurrences are unioned, since
  // one Selection id can be marked in several places and they nest freely.
  const selections = new Map<string, AuthoringWindow>();
  for (const selection of parsed.selections) {
    let start = Infinity;
    let end = 0;
    for (const occurrence of selection.occurrences) {
      const first = frameOfToken[occurrence.open.boundary.tokenIndex];
      const last = frameOfToken[occurrence.close.boundary.tokenIndex - 1];
      if (first === undefined || last === undefined) continue;
      start = Math.min(start, first.frame);
      end = Math.max(end, last.end);
    }
    if (start < end) selections.set(selection.id, { startFrame: start, endFrameExclusive: end });
  }
  return { takes, selections, frameCount: frameCursor };
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
  readonly run: string;
  readonly element: string;
  readonly out: string;
  readonly segment?: string;
  readonly selection?: string;
};

/**
 * Render one element of a Source the way that Source configures it, without a Build and without a
 * Provider.
 *
 * `reconstruction-loop.md` compares a reconstructed element against the reference. What it must
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
 *   how long each Segment runs                    the Source's own `estimate:Speech`
 *   the layers a Build has not made               `make-placeholder`, sized from the Canvas
 *
 * The one thing missing before a Build is real speech, and `standInTakes` supplies a Segment
 * skeleton from the estimator the Source already trusts — the same numbers it ordered its takes
 * with, not a second clock. Those takes enter through `<value>` and `<satisfy>`, the mechanism
 * `examples/all-components-preview` uses to open in Studio without spending anything, so nothing
 * here is a private back door into the graph.
 *
 * What this settles: which elements are on screen together, where each sits, at what size, weight and
 * colour. What it does not: real timing, which waits for `playbooks/craft/production-gates.md` Gate 3.
 */
export async function renderElement(input: RenderElementInput): Promise<Record<string, unknown>> {
  const element = input.element;
  const cwd = invokedFrom();
  const runPath = resolve(cwd, input.run);
  const packageRoot = repositoryRoot();
  const projectRoot = dirname(runPath);
  const outPath = resolve(cwd, input.out);

  const runSource = await readFile(runPath, "utf8").catch(() => undefined);
  assert(runSource !== undefined, `cannot read ${runPath}`);
  const author = /<author\s+source="([^"]+)"/u.exec(runSource)?.[1];
  assert(author !== undefined, `${input.run} declares no <author source="…"/>`);
  const svmlPath = resolve(projectRoot, author);
  let svml = await readFile(svmlPath, "utf8").catch(() => undefined);
  assert(svml !== undefined, `cannot read ${svmlPath}`);

  // The Program's frame rate and the Canvas the render composes at, both read rather than assumed. A
  // harness that hard-codes either produces a picture at a geometry the reference never had.
  const clock = /<[a-z-]*:?Clock\b[^>]*?\bframe-rate="(\d+)"/su.exec(svml)?.[1]
    ?? /<time:Clock\b[^>]*?\bfps="(\d+)"/su.exec(svml)?.[1];
  const frameRate = Number(clock ?? 30);
  const canvasMatch = /<space:Canvas\b[^>]*?\bwidth="(\d+)"[^>]*?\bheight="(\d+)"/su.exec(svml);
  assert(canvasMatch !== null, "the Source declares no <space:Canvas width= height=/>");
  const canvas = { width: Number(canvasMatch[1]), height: Number(canvasMatch[2]) };

  // Which SemanticTake output belongs to which Segment, so each stand-in lands on the right one.
  const takeOutputs = new Map<string, string>();
  for (const match of svml.matchAll(/<whisperx:SemanticTake\b([^>]*?)\/?>/gsu)) {
    const attributes = match[1] ?? "";
    const id = /\bid="([^"]+)"/u.exec(attributes)?.[1];
    const segment = /\bsegment=\{story\.segment\.([A-Za-z0-9_-]+)\}/u.exec(attributes)?.[1];
    if (id !== undefined && segment !== undefined) takeOutputs.set(segment, id);
  }
  assert(takeOutputs.size > 0, "the Source declares no whisperx:SemanticTake to stand in for");

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
  const compareRoot = join(projectRoot, ".hypit", "compare");
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
    // The fragment sits two directories below the Source it came from, so its own relative imports
    // have to reach back the same distance the derived Run's carried files do.
    const repointed = sliced.text.replace(/(\s(?:source|from)=")\.\//gu, "$1../../");
    await writeFile(sourcePath, repointed, "utf8");
    // Everything downstream reads the Source: which Takes to stand in for, which media to mock, which
    // outputs to satisfy. Left on the original it would declare mocks for elements the cut removed,
    // and a `<satisfy>` naming an output that no longer exists is refused.
    svml = repointed;
  }

  const { takes, selections, frameCount: programFrames } = await standInTakes(sourcePath, frameRate, focus);
  const framesBySegment = new Map(takes.map((item) => [item.segmentId, item.take.segment.endFrameExclusive]));
  // A Selection's window in frames, summed over the stand-in tokens it covers. This is the same word
  // span the Source binds to, carried into frames by the same estimate that sized the Segment.
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
    for (const match of svml.matchAll(/<whisperx:SemanticTake\b([^>]*?)\/?>/gsu)) {
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
      windows.set(media, frameRate * 2);
    }
    const carries = new Map<string, { readonly frames: number; readonly picture: boolean }>();
    for (const match of svml.matchAll(/<pipeline:Normalize\b([^>]*?)\/?>/gsu)) {
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

  const domain = await loadStudioDomain({ run: derivedRun, workspaceRoot: projectRoot, packageRoot });
  const archive = await openStudioArchive(undefined, packageRoot);
  let built: Preview;
  try {
    const run = await loadStudioRun({ run: derivedRun, domain, ...(archive === undefined ? {} : { archive }) });
    const inspection = inspectStudioRun(run.source, run);
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
    throw new Error([
      `the Source places no element named ${element}. It places:`,
      ...built.tracks.map((track) => `  ${String(track.outputRef ?? "").split("::output::")[1] ?? track.name}`),
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
  const hyperframesCli = createRequire(join(packageRoot, "packages/provider-hyperframes-local/package.json"))
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

  return {
    element,
    out: outPath,
    compared: clip ? "clip" : "still",
    canvas,
    frame_rate: frameRate,
    window,
    program_frames: programFrames,
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
      pictures.push({ package_dir: directory, picture, drawn: true, tag, element, out });
      written += 1;
    }
  }
  return { package_dirs: directories, drew: written, pictures };
}
