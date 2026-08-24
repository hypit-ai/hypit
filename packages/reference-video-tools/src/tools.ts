import type { Part } from "@google/genai";
import { access, appendFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { loadNodePackageSelection } from "@hypit/package-loader-node";
import { markupSurfaceHostFacetAbi } from "@hypit/markup";
import type { RegisteredSurface, SurfaceVocabulary } from "@hypit/markup";
import { exactModelHostAbi } from "@hypit/model-kit";

import { authorSource, invokedFrom, referenceWords, renderElement, renderPreviews, spokenRange, standInSidecarPath } from "./authoring.js";
import type { RenderElementInput, RenderPreviewsInput, SpokenRange, StandInFocus, StandInSidecar } from "./authoring.js";
import { writePlaceholder } from "./placeholder.js";
import { previewCheck, reconstructionCheck } from "./checks.js";
import type { PreviewCheckInput, ReconstructionCheckInput } from "./checks.js";
import {
  assert,
  cutClip,
  cutFrame,
  ensureDir,
  prepareMedia,
  probe,
  readJson,
  readBytes,
  referenceId,
  round,
  shotTile,
  writeJson,
} from "./media.js";
import { prepareTranscript } from "./transcript.js";
import type { Observation, ObservationTaskRequest, Observer, PrepareResult, ReferenceState, Shot, Transcript } from "./types.js";

export type PrepareReferenceInput = {
  readonly video_path: string;
  readonly redo?: "media" | "transcript" | "people" | "voices" | "systems" | "places" | "all";
  readonly observer?: Observer;
};
export type ObserveReferenceInput = {
  readonly reference_id: string;
  readonly shot_ids?: readonly string[];
  readonly question?: string;
  readonly reobserve?: boolean;
};
export type RecordObservationInput = {
  readonly reference_id: string;
  readonly key: string;
  readonly text: string;
};
export type InspectVocabularyInput = {
  readonly package_names: readonly string[];
  readonly tags?: readonly string[];
  readonly include_previews?: boolean;
};
export type CompareReconstructionInput = {
  readonly reference_id: string;
  /**
   * A stretch of the reference to compare against, named one of two ways. Exactly one is given.
   *
   * `shot_id` is a cut in the picture. `segment` and `selection` are word ranges, which is what a
   * render covers: a render is drawn over the words the Script marks, so the reference beside it is
   * the stretch that speaks those same words.
   */
  readonly shot_id?: string;
  readonly segment?: string;
  readonly selection?: string;
  /** The Run whose Author SVML the words are read from. Required with `segment` or `selection`. */
  readonly run?: string;
  /** A rendered still. Exactly one of `image_path` and `video_path` is given. */
  readonly image_path?: string;
  /**
   * A rendered clip covering the shot. Comparing the whole stretch rather than one frame is what
   * removes the frame-choosing problem: an element that animates in, leaves and is replaced within
   * one shot has no single characteristic frame, and an observation asserting when it changed is the
   * least reliable evidence there is.
   */
  readonly video_path?: string;
  readonly question?: string;
  /**
   * Names the reconstructed element this image draws, for the comparison log only. It is never sent
   * to the observer: the comparison stays blind, and this is what lets a later gate tell which
   * elements have been compared and which have never been looked at.
   */
  readonly element?: string;
};

export type MakePlaceholderInput = {
  readonly out: string;
  readonly width: number;
  readonly height: number;
  readonly color?: string;
  /** Produce a video placeholder for a slot that only accepts video, instead of a PNG. */
  readonly video?: boolean;
  /** Video placeholder duration in seconds; defaults to 1. Ignored for a PNG. */
  readonly seconds?: number;
};

export type { RenderElementInput, RenderPreviewsInput } from "./authoring.js";
export type { PreviewCheckInput, ReconstructionCheckInput } from "./checks.js";

export type ReferenceVideoTools = {
  list_svml_packages(): Promise<Record<string, unknown>>;
  prepare_reference(input: PrepareReferenceInput): Promise<PrepareResult>;
  observe_reference(input: ObserveReferenceInput): Promise<Record<string, unknown>>;
  inspect_svml_vocabulary(input: InspectVocabularyInput): Promise<Record<string, unknown>>;
  compare_reconstruction(input: CompareReconstructionInput): Promise<Record<string, unknown>>;
  record_observation(input: RecordObservationInput): Promise<Record<string, unknown>>;
  make_placeholder(input: MakePlaceholderInput): Promise<Record<string, unknown>>;
  render_element(input: RenderElementInput): Promise<Record<string, unknown>>;
  render_previews(input: RenderPreviewsInput): Promise<Record<string, unknown>>;
  preview_check(input: PreviewCheckInput): Promise<Record<string, unknown>>;
  reconstruction_check(input: ReconstructionCheckInput): Promise<Record<string, unknown>>;
};

type ToolOptions = {
  readonly workspaceRoot?: string;
  readonly packageRoot?: string;
  readonly model?: string;
  readonly concurrency?: number;
  readonly launchGapMs?: number;
  readonly retryDelayMs?: number;
  readonly generate?: GenerateText;
};
export type GenerateText = (input: { readonly parts: readonly Part[]; readonly instruction: string }) => Promise<string>;
type ObservationTask = { readonly key: string; readonly request: Request };

function observation(status: Observation["status"], text: string): Observation { return { status, text }; }
function unavailable(reason: string): Transcript { return { status: "unavailable", transcript_ref: null, word_count: 0, reason }; }

function positiveEnv(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw.length === 0) return undefined;
  const value = Number(raw);
  assert(Number.isSafeInteger(value) && value > 0, `${name} must be a positive integer`);
  return value;
}

function stateRoot(workspaceRoot: string, reference: string): string {
  return join(workspaceRoot, ".hypit", "reference-video-tools", reference);
}

/**
 * The stretch a word-range comparison covered: the words it was asked for, and the seconds it cut.
 *
 * The two differ by however far each end was moved onto a shot boundary lying inside its own end
 * word. `head_snapped` and `tail_snapped` say whether that end landed on a cut, which is what
 * decides whether the pair opens and closes on a whole shot or part-way through one.
 */
export type ComparedRange = {
  readonly segment?: string;
  readonly selection?: string;
  readonly words: string;
  readonly words_start_seconds: number;
  readonly words_end_seconds: number;
  readonly cut_start_seconds: number;
  readonly cut_end_seconds: number;
  readonly head_snapped: boolean;
  readonly tail_snapped: boolean;
};

/** One line per comparison performed, appended so a stopped loop still leaves its trail. */
export type ComparisonRecord = {
  readonly at: string;
  /** Which stretch was compared. A comparison names its shot or its word range, never both. */
  readonly shot_id?: string;
  readonly range?: ComparedRange;
  readonly element?: string;
  readonly image_path: string;
  readonly image_digest: string;
  readonly observer: Observer;
  readonly status: Observation["status"];
  readonly scoped: boolean;
  /** Whether the whole shot was compared as a clip, or one frame of it as a still. */
  readonly clip?: boolean;
  /**
   * What timed the stand-in the picture was drawn over, from the sidecar `render_element` writes
   * beside its output. Present when the picture came from `render_element`.
   */
  readonly stand_in?: StandInSidecar;
};

async function fileDigest(path: string): Promise<string> {
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}

/**
 * What timed the stand-in behind a rendered picture, read from beside the picture itself.
 *
 * A comparison is handed a path. Whether the stretch in it ran at the reference's pace or at an
 * estimate of it is not in the pixels, and a picture from anywhere else has no sidecar at all, so a
 * missing one is an absence to record rather than a refusal.
 */
async function standInBeside(renderedPath: string): Promise<StandInSidecar | undefined> {
  const text = await readFile(standInSidecarPath(renderedPath), "utf8").catch(() => undefined);
  if (text === undefined) return undefined;
  try { return JSON.parse(text) as StandInSidecar; } catch { return undefined; }
}

async function appendComparison(root: string, record: ComparisonRecord): Promise<void> {
  await appendFile(join(root, "comparisons.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
}



function positiveInt(value: number, label: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${label} must be a positive integer.`);
  return value;
}

async function defaultGenerate(model: string): Promise<GenerateText> {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  assert(project, "GOOGLE_CLOUD_PROJECT is required");
  assert(credentials, "GOOGLE_APPLICATION_CREDENTIALS_JSON is required");
  let parsed: unknown;
  try { parsed = JSON.parse(credentials); } catch { throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON"); }
  assert(parsed !== null && typeof parsed === "object" && !Array.isArray(parsed), "Google credentials must be an object");
  let GoogleGenAI: typeof import("@google/genai")["GoogleGenAI"];
  try {
    ({ GoogleGenAI } = await import("@google/genai"));
  } catch (error) {
    throw new Error(
      "Gemini observation requires @google/genai. Install it once with: hypit packages install @google/genai@1.52.0",
      { cause: error },
    );
  }
  const client = new GoogleGenAI({
    vertexai: true,
    project,
    location: process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global",
    googleAuthOptions: { credentials: parsed as Record<string, unknown>, scopes: ["https://www.googleapis.com/auth/cloud-platform"] },
  });
  return async ({ parts, instruction }) => {
    const result = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [...parts] }],
      config: { systemInstruction: instruction, temperature: 1.0, responseMimeType: "text/plain" },
    });
    const text = result.text?.trim() ?? "";
    assert(text.length > 0, "Gemini returned an empty response");
    return text;
  };
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  wav: "audio/wav",
  mp4: "video/mp4",
};

// The Vertex path cannot upload a file and reference it later, so the bytes travel with every
// request. One shot's clip is asked about by its own picture, type and sound observations and by the
// boundary on each side, so reading and encoding it once per invocation is worth the memory.
function mediaParts(): (path: string) => Promise<Part> {
  const encoded = new Map<string, Promise<Part>>();
  return (path) => {
    const held = encoded.get(path);
    if (held !== undefined) return held;
    const part = (async (): Promise<Part> => {
      const bytes = await readBytes(path);
      const extension = path.toLowerCase().split(".").pop() ?? "";
      const mimeType = MIME_TYPES[extension];
      assert(mimeType !== undefined, `unsupported media extension for ${path}; supported: ${Object.keys(MIME_TYPES).join(", ")}`);
      return { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } };
    })();
    encoded.set(path, part);
    return part;
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rateLimited(error: unknown): boolean {
  return /\b429\b|resource[ _]exhausted|quota|rate limit/iu.test(message(error));
}

// A rejected request is rejected every time. Retrying one only delays the failure the caller has to
// see, so these end the attempt loop immediately; everything else stays retryable.
function permanent(error: unknown): boolean {
  return /invalid[_ ]argument|permission[_ ]denied|unauthenticated|not[_ ]found|failed[_ ]precondition/iu.test(message(error));
}

async function callSafely(retryDelayMs: number, generate: GenerateText, parts: readonly Part[], instruction: string): Promise<Observation> {
  let last: unknown;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try { return observation("complete", await generate({ parts, instruction })); }
    catch (error) {
      last = error;
      if (permanent(error)) break;
      if (attempt === 6) break;
      const wait = rateLimited(error) ? Math.min(900_000, 45_000 * 2 ** (attempt - 1)) : retryDelayMs * attempt;
      await new Promise((resolveWait) => setTimeout(resolveWait, wait));
    }
  }
  return observation("failed", last instanceof Error ? last.message : String(last));
}

// The agent observer reads pictures, so each piece of evidence a request would have uploaded becomes
// one it can look at: a shot's clip becomes that shot's frame tile, the whole video becomes the
// storyboard of representative frames, and audio has no picture to become. What each observation asks
// is identical on both paths; only the shape of the evidence differs.
function asPictures(media: readonly string[], state: ReferenceState): readonly string[] {
  const tiles = new Map(state.shots.map((shot) => [shot.clip_ref, shot.frames_tile_ref]));
  const pictures: string[] = [];
  for (const path of media) {
    const tile = tiles.get(path);
    if (tile !== undefined) {
      // Every shot of a reference prepared for this observer has a tile. One without means the media
      // was prepared for the observer that reads video, which `prepare_reference` refuses to mix.
      assert(tile !== null, `shot media for ${path} has no frame tile; re-prepare the reference with --redo all --observer agent`);
      pictures.push(tile);
    }
    // A whole-reference question is asked over the whole reference. The storyboard puts every shot in
    // one picture and is how the video is read at a glance, but one frame per shot answers neither
    // what moves nor what recurs, so the shot tiles come with it and the question sees every frame
    // the shot observations see.
    else if (path === state.analysis_video_ref) pictures.push(state.storyboard_ref, ...state.shots.flatMap((shot) => shot.frames_tile_ref === null ? [] : [shot.frames_tile_ref]));
    // This observer reads pictures. Video that is not a prepared shot has no tile to stand in for it,
    // and handing the file through would give the agent something it cannot open — a comparison clip
    // is tiled by its caller before it arrives here.
    else if (/\.(mp4|mov|webm|mkv)$/iu.test(path)) assert(false, `${path} is video; tile it before asking the agent observer to read it`);
    else if (!path.toLowerCase().endsWith(".wav")) pictures.push(path);
  }
  return [...new Set(pictures)];
}

// What the pictures are has to be said, because a tile of frames is not what the prompt was written
// for. The prompt itself is unchanged on both paths: only this preamble is added, and only here.
const TILE_PREAMBLE = "Each supplied picture that shows a grid of frames is one shot, sampled evenly"
  + " across its duration and laid out in reading order: left to right, then top to bottom. Read the"
  + " grid as time passing. A single picture that is not a grid is one moment.";
// There is no second source of sound to fall back to, so this says how to answer from what there is
// rather than leaving the observation short. The transcript settles when speech happens; the picture
// settles who is on screen while it does. Read together they carry the question far enough to answer.
const NO_SOUND = "You are reading pictures and cannot hear this reference. Answer from the pictures and"
  + " the measured transcript together: the transcript says exactly when words are spoken, and the"
  + " pictures say who is on screen and whose mouth is moving while they are. Attribute speech to the"
  + " person the pictures show speaking during the words the transcript places there, and answer the"
  + " question in full rather than deferring the parts that would be easier with sound.";

/** Declares one observation: what it asks, and the evidence it asks over. The observer decides how. */
type Request = {
  readonly media: readonly string[];
  readonly prompt: string;
  readonly instruction: string;
  /** True when answering needs sound. The `agent` observer has none and is told to say so. */
  readonly sound?: boolean;
};
type Asker = (key: string, request: Request) => Promise<Observation>;

async function pacedMap<T, R>(items: readonly T[], concurrency: number, gapMs: number, run: (item: T, index: number) => Promise<R>): Promise<readonly R[]> {
  const result = new Array<R>(items.length);
  let cursor = 0;
  let previousLaunch = Promise.resolve();
  let nextLaunchAt = 0;
  const launch = (): Promise<void> => {
    const current = previousLaunch.then(async () => {
      const wait = nextLaunchAt - Date.now();
      if (wait > 0) await new Promise((resolveWait) => setTimeout(resolveWait, wait));
      nextLaunchAt = Date.now() + gapMs;
    });
    previousLaunch = current;
    return current;
  };
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await launch();
      result[index] = await run(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, worker));
  return result;
}

async function runObservationTasks(
  root: string,
  tasks: readonly ObservationTask[],
  forcedKeys: ReadonlySet<string>,
  concurrency: number,
  gapMs: number,
  ask: Asker,
): Promise<ReadonlyMap<string, Observation>> {
  const path = join(root, "observations.json");
  const cache = await readJson<Record<string, Observation>>(path) ?? {};
  const outstanding = tasks.filter((task) => forcedKeys.has(task.key) || cache[task.key]?.status !== "complete");
  const completed = await pacedMap(outstanding, concurrency, gapMs, async (task) => ({ key: task.key, value: await ask(task.key, task.request) }));
  const answers = new Map(completed.map((item) => [item.key, item.value]));
  // A pending answer is a task handed out, not an answer received. Caching it would make the next run
  // read the placeholder as complete and never ask again.
  for (const item of completed) if (item.value.status !== "pending") cache[item.key] = item.value;
  await writeJson(path, cache);
  return new Map(tasks.map((task) => [task.key, cache[task.key] ?? answers.get(task.key) ?? observation("failed", "not observed")]));
}

async function shotFromBound(root: string, index: number, bound: { start: number; end: number; group: number; part: number; parts: number }, tiles: boolean): Promise<Shot> {
  const id = String(index + 1).padStart(3, "0");
  const dir = join(root, "shots");
  const audioPath = join(dir, `${id}-audio.wav`);
  let audio_tail_ref: string | null = null;
  try { await access(audioPath); audio_tail_ref = audioPath; } catch { /* silent shot */ }
  return {
    shot_id: `shot-${id}`,
    index: index + 1,
    start_seconds: bound.start,
    end_seconds: bound.end,
    duration_seconds: Number((bound.end - bound.start).toFixed(3)),
    initial_group: bound.group,
    part: bound.part,
    parts: bound.parts,
    clip_ref: join(dir, `${id}.mp4`),
    representative_frame_ref: join(dir, `${id}-representative.jpg`),
    tail_frame_ref: join(dir, `${id}-tail.jpg`),
    frames_tile_ref: tiles ? join(dir, `${id}-frames.jpg`) : null,
    audio_tail_ref,
  };
}

/** One stretch of the reference cut to a word range, with the rendered clip trimmed to match it. */
type RangeCut = {
  readonly record: ComparedRange;
  readonly reference: string;
  readonly rendered: string;
  readonly referenceTile: string;
  readonly renderedTile: string;
  /** How long the cut runs, which is the duration both frame grids are sampled against. */
  readonly seconds: number;
  readonly referenceSeconds: number;
  readonly renderedSeconds: number;
  /** What the observer is told about an end that lands part-way through a shot. Empty when neither does. */
  readonly incomplete: string;
};

/**
 * Every cut in the reference, in seconds.
 *
 * A stretch longer than fifteen seconds is divided into parts so each clip stays short enough to
 * observe, and the divisions between those parts are not cuts: the picture runs straight through
 * them. Only the first part of a group begins where the picture changes.
 */
function referenceCuts(state: ReferenceState): readonly number[] {
  return [...state.shots.filter((shot) => shot.part === 1).map((shot) => shot.start_seconds), state.shots.at(-1)!.end_seconds];
}

/**
 * Cut the reference to the stretch that speaks a range of words, and trim the render to match.
 *
 * Each end is moved onto a shot boundary when one lies inside its own end word. A boundary inside
 * the first word cannot add or drop a whole word — the word is still spoken across the cut either
 * way — so the pair then opens and closes on the picture changing rather than part-way through a
 * shot, and still covers exactly the words asked for. An end with no boundary inside its word stays
 * where the word puts it.
 *
 * The render is trimmed by the seconds each end moved. Its frames come from the same word timings,
 * so a second of reference at the head is a second of render at the head, and taking it off both
 * keeps the two stretches showing the same word at the same offset.
 */
async function cutWordRange(
  state: ReferenceState,
  root: string,
  focus: StandInFocus,
  range: SpokenRange,
  renderedPath: string,
  clip: boolean,
): Promise<RangeCut> {
  const cuts = referenceCuts(state);
  const head = cuts.find((at) => at >= range.first.startSeconds && at < range.first.endSeconds);
  const tail = [...cuts].reverse().find((at) => at > range.last.startSeconds && at <= range.last.endSeconds);
  const start = head ?? range.startSeconds;
  const end = tail ?? range.endSeconds;
  const seconds = end - start;
  assert(seconds > 0, `${focus.selection ?? focus.segment} spans no time in the reference`);

  const dir = join(root, "ranges");
  await ensureDir(dir);
  const label = focus.selection === undefined ? `segment-${focus.segment}` : `selection-${focus.selection}`;
  const reference = join(dir, `${label}-reference.${clip ? "mp4" : "jpg"}`);
  // The reference's own analysis video, which is the whole reference at the size every other
  // observation reads it at. A shot clip covers a cut in the picture and would cover the wrong words.
  if (clip) await cutClip(state.analysis_video_ref, start, seconds, reference);
  else await cutFrame(state.analysis_video_ref, start + seconds / 2, reference);

  let rendered = renderedPath;
  let referenceSeconds = 0;
  let renderedSeconds = 0;
  if (clip) {
    const drawn = await probe(renderedPath);
    assert(drawn.frameRate > 0, `${renderedPath} reports no frame rate, so it cannot be trimmed to the cut`);
    // Frames are the only unit the file has, so the seconds each end moved are converted at the
    // render's own rate and taken off as whole frames.
    const headFrames = Math.round((start - range.startSeconds) * drawn.frameRate);
    const tailFrames = Math.round((range.endSeconds - end) * drawn.frameRate);
    rendered = join(dir, `${label}-rendered.mp4`);
    await cutClip(renderedPath, headFrames / drawn.frameRate, drawn.duration - (headFrames + tailFrames) / drawn.frameRate, rendered);
    referenceSeconds = (await probe(reference)).duration;
    renderedSeconds = (await probe(rendered)).duration;
    // Two stretches of different lengths cannot be read side by side: whatever is at a given offset
    // in one is at a different word in the other, which is the defect this cut exists to remove.
    // Each side lands on its own frame grid, so they agree to within a frame rather than exactly.
    assert(Math.abs(referenceSeconds - renderedSeconds) <= 2 / drawn.frameRate,
      `the cut reference runs ${round(referenceSeconds)}s and the trimmed render ${round(renderedSeconds)}s; they must cover the same stretch`);
  }

  // An end that could not be moved onto a cut opens or closes part-way through a shot. How much of
  // the stretch that is, is measurable here, and saying it is what keeps the incomplete shot from
  // being read as a difference.
  const enclosing = (at: number): { readonly start: number; readonly end: number } => {
    let index = 0;
    for (let candidate = 0; candidate + 1 < cuts.length; candidate += 1) if (cuts[candidate]! <= at) index = candidate;
    return { start: cuts[index]!, end: cuts[index + 1]! };
  };
  const opening = enclosing(start);
  const closing = enclosing(end);
  const lead = head === undefined ? Math.min(opening.end, end) - start : 0;
  const trail = tail === undefined ? end - Math.max(closing.start, start) : 0;
  const ends = !clip
    ? []
    // A range short enough to sit inside one shot has both its ends in that shot, and naming them
    // separately describes the same seconds twice.
    : head === undefined && tail === undefined && opening.start === closing.start
      ? [`All ${seconds.toFixed(2)} seconds fall inside a single shot that begins before this stretch does and ends after it.`]
      : [
        ...(lead > 0 ? [`The first ${lead.toFixed(2)} seconds fall inside a shot that begins before this stretch does.`] : []),
        ...(trail > 0 ? [`The last ${trail.toFixed(2)} seconds fall inside a shot that ends after this stretch does.`] : []),
      ];

  return {
    record: {
      ...(focus.segment === undefined ? {} : { segment: focus.segment }),
      ...(focus.selection === undefined ? {} : { selection: focus.selection }),
      words: `${range.first.text} … ${range.last.text}`,
      words_start_seconds: round(range.startSeconds),
      words_end_seconds: round(range.endSeconds),
      cut_start_seconds: round(start),
      cut_end_seconds: round(end),
      head_snapped: head !== undefined,
      tail_snapped: tail !== undefined,
    },
    reference,
    rendered,
    referenceTile: join(dir, `${label}-reference-tile.jpg`),
    renderedTile: join(dir, `${label}-rendered-tile.jpg`),
    seconds,
    referenceSeconds: round(referenceSeconds),
    renderedSeconds: round(renderedSeconds),
    incomplete: ends.length === 0
      ? ""
      : `\n\n${ends.join(" ")} Read ${ends.length === 1 ? "that stretch as an incomplete shot" : "those stretches as incomplete shots"} and report no differences from ${ends.length === 1 ? "it" : "them"}.`,
  };
}

function prepared(state: ReferenceState): boolean {
  return state.transcript?.status === "complete"
    && state.people_and_product?.status === "complete"
    && state.voices?.status === "complete"
    && state.persistent_systems?.status === "complete"
    && state.places?.status === "complete";
}

function publicPrepare(state: ReferenceState): PrepareResult {
  return {
    reference_id: state.reference_id,
    status: prepared(state) ? "ready" : "partial",
    video: state.video,
    shots: state.shots,
    storyboard_ref: state.storyboard_ref,
    transcript: state.transcript ?? unavailable("not transcribed"),
    people_and_product: state.people_and_product ?? observation("failed", "not analyzed"),
    voices: state.voices ?? observation("failed", "not analyzed"),
    persistent_systems: state.persistent_systems ?? observation("failed", "not analyzed"),
    places: state.places ?? observation("failed", "not analyzed"),
  };
}

export function createReferenceVideoTools(options: ToolOptions = {}): ReferenceVideoTools {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const packageRoot = resolve(options.packageRoot ?? workspaceRoot);
  const model = options.model ?? process.env.GEMINI_MODEL?.trim() ?? "gemini-3.1-pro-preview";
  // Pacing is deployment policy, not author intent: it depends on the quota behind the credentials,
  // which the calling agent has no way to know. It is settable here and through the environment, and
  // deliberately not through a CLI flag.
  // Four at a time with a short gap completed a whole reference twice with no rate limiting, and the
  // binding constraint is per-request latency rather than the launch gap: nine requests at four took
  // about as long as three waves, not nine. A quota that dislikes it lowers these.
  const concurrency = options.concurrency ?? positiveEnv("HYPIT_REFERENCE_CONCURRENCY") ?? 4;
  const gapMs = options.launchGapMs ?? positiveEnv("HYPIT_REFERENCE_LAUNCH_GAP_MS") ?? 1_500;
  const retryDelayMs = options.retryDelayMs ?? 2_000;
  let generatorPromise: Promise<GenerateText> | undefined;
  const generator = async (): Promise<GenerateText> => generatorPromise ??= options.generate === undefined ? defaultGenerate(model) : Promise.resolve(options.generate);

  const loadState = async (reference: string): Promise<ReferenceState> => {
    const path = join(stateRoot(workspaceRoot, reference), "state.json");
    const state = await readJson<ReferenceState>(path);
    assert(state !== undefined, `reference ${reference} was not prepared in ${workspaceRoot}`);
    return state;
  };

  // One reference is read by one observer throughout. Mixing them inside a single reference would
  // leave observations of two different kinds of evidence under the same keys, with nothing on the
  // record saying which is which, so the choice is made once at prepare and carried in the state.
  const askerFor = async (
    observer: Observer,
    state: ReferenceState,
  ): Promise<{ readonly ask: Asker; readonly pending: readonly ObservationTaskRequest[] }> => {
    if (observer === "agent") {
      const pending: ObservationTaskRequest[] = [];
      return {
        pending,
        ask: async (key, { media, prompt, instruction, sound }) => {
          const preamble = sound === true ? `${TILE_PREAMBLE}\n\n${NO_SOUND}` : TILE_PREAMBLE;
          pending.push({ key, instruction, prompt: `${preamble}\n\n${prompt}`, image_refs: asPictures(media, state) });
          return observation("pending", "awaiting the agent observer");
        },
      };
    }
    const generate = await generator();
    const mediaPart = mediaParts();
    return {
      pending: [],
      ask: async (_key, { media, prompt, instruction }) => {
        const parts: Part[] = [];
        for (const path of media) parts.push(await mediaPart(path));
        parts.push({ text: prompt });
        return await callSafely(retryDelayMs, generate, parts, instruction);
      },
    };
  };

  return {
    // Which packages exist is the first question of every reconstruction, and until now the only
    // answer was to read a guide and a directory listing by hand. The Build CLI deliberately never
    // scans a directory; this is a development tool, so it may.
    async list_svml_packages(): Promise<Record<string, unknown>> {
      const scope = join(packageRoot, "node_modules", "@hypit");
      const names = await readdir(scope).catch(() => [] as string[]);
      assert(names.length > 0, `no installed @hypit packages under ${scope}`);
      const packages: Record<string, unknown>[] = [];
      for (const name of [...names].sort()) {
        const specifier = `@hypit/${name}`;
        const manifest = await readJson<{ readonly hypit?: { readonly activation?: string }; readonly description?: string }>(
          join(scope, name, "package.json"));
        if (manifest?.hypit?.activation === undefined) continue;
        // A package publishes several kinds of facet. Reading them all as one kind produced a null
        // for every facet that is not a Markup Surface, which is what an exact-model package mostly
        // publishes — the listing said `["TextVideo", "Value", null]` and a Provider said `[null]`.
        const tags: string[] = [];
        const models: string[] = [];
        let note: string | undefined;
        try {
          for (const pack of await loadNodePackageSelection([specifier], packageRoot)) {
            for (const facet of pack.contribution.hostFacets ?? []) {
              if (facet.abi === markupSurfaceHostFacetAbi) {
                tags.push((facet.implementation as RegisteredSurface).tag);
                continue;
              }
              if (facet.abi === exactModelHostAbi) {
                models.push(...(facet as { readonly offers?: readonly string[] }).offers ?? []);
              }
            }
          }
        } catch (error) { note = error instanceof Error ? error.message : String(error); }
        packages.push({
          package_name: specifier,
          ...(manifest.description === undefined ? {} : { description: manifest.description }),
          tags: [...new Set(tags)].sort(),
          ...(models.length === 0 ? {} : { models: [...new Set(models)].sort() }),
          ...(note === undefined ? {} : { unreadable: note }),
        });
      }
      return { package_root: packageRoot, packages };
    },

    async prepare_reference(input): Promise<PrepareResult> {
      assert(input.redo === undefined || input.redo === "media" || input.redo === "transcript" || input.redo === "people" || input.redo === "voices" || input.redo === "systems" || input.redo === "places" || input.redo === "all", "redo must be one of: media, transcript, people, voices, systems, places, all");
      const videoPath = resolve(input.video_path);
      const file = await stat(videoPath).catch(() => undefined);
      assert(file?.isFile(), `video_path is not a file: ${videoPath}`);
      const reference = await referenceId(videoPath);
      const root = stateRoot(workspaceRoot, reference);
      const statePath = join(root, "state.json");
      let existing = await readJson<ReferenceState>(statePath);
      const redoMedia = input.redo === "media" || input.redo === "all";
      const redoTranscript = input.redo === "transcript" || input.redo === "all";
      const redoPeople = input.redo === "people" || input.redo === "all";
      const redoVoices = input.redo === "voices" || input.redo === "all";
      const redoSystems = input.redo === "systems" || input.redo === "all";
      const redoPlaces = input.redo === "places" || input.redo === "all";
      // A reference keeps the observer it was prepared with. Asking for the other one on a reference
      // that already holds observations would read the second half of it through different evidence
      // from the first, so the mismatch is refused rather than silently mixed.
      const observer: Observer = input.observer ?? existing?.observer ?? "gemini";
      assert(input.redo === "all" || existing?.observer === undefined || existing.observer === observer,
        `reference ${reference} was prepared for the ${existing?.observer} observer; --redo all re-prepares it for the other one`);
      if (input.redo === undefined && existing !== undefined && prepared(existing)) return { ...publicPrepare(existing), observer, pending_observations: [] };
      await ensureDir(root);
      const info = existing?.video === undefined || redoMedia ? await probe(videoPath) : {
        duration: existing.video.duration_seconds,
        width: existing.video.width,
        height: existing.video.height,
        hasAudio: existing.video.has_audio,
      };
      let state: ReferenceState;
      let analysisVideo: string;
      if (existing !== undefined && !redoMedia && existing.shots.length > 0) {
        state = existing;
        analysisVideo = existing.analysis_video_ref;
      } else {
        const media = await prepareMedia(videoPath, root, info.duration, observer === "agent");
        const shots = await Promise.all(media.bounds.map((bound, index) => shotFromBound(root, index, bound, observer === "agent")));
        state = {
          reference_id: reference,
          video_path: videoPath,
          root,
          video: { duration_seconds: Number(info.duration.toFixed(3)), width: info.width, height: info.height, has_audio: info.hasAudio },
          shots,
          storyboard_ref: media.storyboard,
          analysis_video_ref: media.analysisVideo,
          // The transcript is measured from the source audio, which rebuilt shot media cannot change.
          ...(existing?.transcript === undefined ? {} : { transcript: existing.transcript }),
          ...(existing?.people_and_product === undefined ? {} : { people_and_product: existing.people_and_product }),
          ...(existing?.voices === undefined ? {} : { voices: existing.voices }),
          ...(existing?.persistent_systems === undefined ? {} : { persistent_systems: existing.persistent_systems }),
          ...(existing?.places === undefined ? {} : { places: existing.places }),
        };
        analysisVideo = media.analysisVideo;
        await writeJson(statePath, state);
        await writeFile(join(root, "observations.json"), "{}\n", "utf8");
      }
      // WhisperX is local and slow and shares nothing with the observation requests, so it runs beside
      // them rather than ahead of them.
      const transcribing = state.transcript?.status === "complete" && !redoTranscript
        ? Promise.resolve(state.transcript)
        : prepareTranscript(reference, videoPath, root, info.hasAudio, "en", redoTranscript);
      const { ask, pending } = await askerFor(observer, state);
      const whole = [analysisVideo];
      const [people, voices, systems, places] = await Promise.all([
        state.people_and_product?.status === "complete" && !redoPeople
          ? Promise.resolve(state.people_and_product)
          : ask("people_and_product", { media: whole, prompt: "Describe the recurring people and the promoted product in this complete reference video. Return natural language only. Identify stable visual traits and distinguish recurring speakers from incidental people in inserts. Describe the product once, comprehensively, for reuse.", instruction: "You only observe a reference video. Return natural language evidence only. Do not write code, markup, SVML, or component names." }),
        state.voices?.status === "complete" && !redoVoices
          ? Promise.resolve(state.voices)
          : ask("voices", { media: whole, sound: true, prompt: "Listen to this complete reference video and describe the distinct voices, their order, overlap, off-screen speech, and likely correspondence to visible people. Do not assign a voice merely because a person appears in a B-roll image. Return natural language only.", instruction: "You only listen to a reference video. Return natural language evidence only. Do not write code, markup, SVML, or component names." }),
        state.persistent_systems?.status === "complete" && !redoSystems
          ? Promise.resolve(state.persistent_systems)
          : ask("persistent_systems", { media: whole, prompt: "Describe the on-screen text and graphic systems that persist or recur across this complete reference video, such as subtitles, running lists, counters, progress indicators, badges, watermarks, lower thirds and repeating full-screen graphic layouts. For each one, state when it first appears and when it stops, whether it is present continuously or intermittently, whether its own appearance stays the same throughout, and describe any point where its appearance actually changes. Report only what stays consistent across the video; ignore one-off elements that appear a single time. Return natural language only.", instruction: "You only observe a reference video. Return natural language evidence only. Do not write code, markup, SVML, or component names." }),
        state.places?.status === "complete" && !redoPlaces
          ? Promise.resolve(state.places)
          : ask("places", { media: whole, prompt: "Describe every distinct place this reference video was shot in, and every distinct camera position within each place. State how many places there are, which parts of the video happen in each, and for each place which camera positions appear and which parts of the video use each one. Two shots are the same camera position when the camera sees the same part of the room from the same side; a reverse angle is a different position of the same place.\n\nDescribe each camera position in enough detail that someone who has never seen this video could draw it from your words alone: what is behind and beside the subject, the shape and depth of the space, where the light comes from and how hard it is, the colours and materials of the surfaces, and the objects a viewer would use to recognise it again. Say what stays identical between positions of one place and what differs.\n\nReturn natural language only.", instruction: "You only observe a reference video. Return natural language evidence only. Do not write code, markup, SVML, or component names." }),
      ]);
      // A pending whole-reference observation is a task the agent still owes, so it is reported rather
      // than written: writing it would make the next run treat the placeholder as an answer.
      const answered = <T extends Observation>(value: T): T | undefined => value.status === "pending" ? undefined : value;
      const complete: ReferenceState = {
        ...state,
        observer,
        transcript: await transcribing,
        ...(answered(people) === undefined ? {} : { people_and_product: people }),
        ...(answered(voices) === undefined ? {} : { voices }),
        ...(answered(systems) === undefined ? {} : { persistent_systems: systems }),
        ...(answered(places) === undefined ? {} : { places }),
      };
      await writeJson(statePath, complete);
      return {
        ...publicPrepare(complete),
        people_and_product: people,
        voices,
        persistent_systems: systems,
        places,
        observer,
        pending_observations: pending,
      };
    },

    async observe_reference(input): Promise<Record<string, unknown>> {
      const state = await loadState(input.reference_id);
      const selected = input.shot_ids === undefined ? state.shots : state.shots.filter((shot) => input.shot_ids!.includes(shot.shot_id));
      assert(selected.length > 0, "no requested shot ids exist");
      const observer: Observer = state.observer ?? "gemini";
      const { ask, pending } = await askerFor(observer, state);
      const question = input.question?.trim() ?? "";
      if (question.length > 0) {
        assert(input.shot_ids !== undefined && input.shot_ids.length > 0, "question requires at least one shot id, so that it is answered from the shots it is about");
        assert(selected.length <= 3, "question accepts at most three shots");
        const answer = await ask("question", {
          media: selected.flatMap((shot) => [shot.clip_ref, shot.representative_frame_ref]),
          prompt: question,
          instruction: "Answer only the narrow reference-video question in natural language. Do not write code, markup, SVML, or component names.",
        });
        return {
          reference_id: state.reference_id,
          observer,
          shot_ids: selected.map((shot) => shot.shot_id),
          question,
          answer,
          unresolved: answer.status === "complete" ? [] : ["question"],
          pending_observations: pending,
        };
      }
      // Every shot observation is asked with the four whole-reference observations quoted into it. The
      // observer that answers in band has them the moment prepare_reference returns; the one that
      // answers out of band has not written them yet, and a sweep run first would ask every shot its
      // question with that context missing and cache the answers.
      if (observer === "agent") {
        const owed = WHOLE_REFERENCE_KEYS.filter((key) => state[key]?.status !== "complete");
        assert(owed.length === 0,
          `answer the whole-reference observations first, with record_observation: ${owed.join(", ")}. `
          + "Every shot observation quotes them, so a sweep run before they exist asks each shot with less than it should have.");
      }
      const selectedIds = new Set(selected.map((shot) => shot.shot_id));
      const boundaryRights = state.shots.filter((shot) => {
        const left = state.shots.find((candidate) => candidate.index === shot.index - 1);
        return left !== undefined && (selectedIds.has(left.shot_id) || selectedIds.has(shot.shot_id));
      });
      const globalContext = [
        state.people_and_product?.text === undefined ? "" : `Full-reference people and product evidence:\n${state.people_and_product.text}`,
        state.voices?.text === undefined ? "" : `Full-reference voice evidence:\n${state.voices.text}`,
        state.persistent_systems?.text === undefined ? "" : `Full-reference persistent on-screen system evidence:\n${state.persistent_systems.text}`,
      ].filter((item) => item.length > 0).join("\n\n");
      const visualTasks: ObservationTask[] = selected.map((shot) => {
        const previous = state.shots.find((candidate) => candidate.index === shot.index - 1);
        return { key: `visual:${shot.shot_id}`, request: {
          media: [shot.clip_ref, shot.representative_frame_ref, ...(previous === undefined ? [] : [previous.tail_frame_ref])],
          prompt: `${globalContext}\n\nObserve shot ${shot.index}. Describe the current base picture, any covering or non-covering visual content, and whether visible content continues from the preceding shot. A full-screen insert is still only a picture observation. Covering content is whatever changes what reaches the eye, not only things that sit on top with an edge: a wash, darkening, gradient or semi-transparent layer laid over the whole frame or a region of it is covering content and must be reported as such, including what the base shows through it.\n\nAlso answer these two questions explicitly.\n\nFirst: is the whole frame a depicted scene that has its own camera space, lighting, depth and lens behaviour, or is it a flat designed field whose purpose is to carry drawn elements such as words, rows, panels or cards? Live action and animation are both depicted scenes; a paper sheet, ruled or gridded surface, flat or gradient colour, blurred wallpaper, board or slide backdrop filling the frame is a designed field. State which one it is and the visible evidence for it.\n\nThen, whichever it is, say whether any *region* of the frame is itself a flat designed field carrying drawn content — a list, a ranking, a leaderboard, a scoreboard, a chart, a panel, a slab of colour holding rows or labels — even when the rest of the frame is a depicted scene, and even when the region has no visible border, card edge or drop shadow around it. Report each such region separately from the scene behind it: roughly where it sits and how much of the frame it covers, given as fractions of the frame width and height; what its own surface is; and what is drawn on it. A designed field occupying half the frame, one side of it, or a band across it is easy to describe as "text over the picture" and is not that: the field itself is the thing to report.\n\nSecond: for every framed element inside the picture, such as a card, phone, browser window, screenshot or inset, describe the picture inside the frame and the frame itself separately. For the inside, describe what it depicts and whether it moves. For the frame, describe its border, corner radius, outline, shadow, size, position and how it enters and leaves.\n\nThird: does this picture move at all, and how? Separate three things: whether the camera moves, and how; whether anything in the picture moves, and what; and whether the picture is completely still. A held photograph, screenshot or card that only appears and disappears is still, however long it is on screen.\n\nReturn natural language evidence only.`,
          instruction: "Observe picture only. Do not choose SVML components, do not write markup, and do not decide final source syntax.",
        } };
      });
      const typeTasks: ObservationTask[] = selected.map((shot) => ({ key: `type:${shot.shot_id}`, request: {
        media: [shot.representative_frame_ref, shot.clip_ref],
        prompt: `Observe the on-screen text in shot ${shot.index}. Report only text that is drawn over or composed into the picture; ignore text belonging to a photographed object such as a device screen, sign, label or document. If the shot shows no drawn text, say exactly that and stop.\n\nFor each distinct text element describe: the typeface character (serif, sans-serif, handwritten, monospaced or display), the weight, the cap height as a fraction of the frame height, letter spacing and line spacing, alignment, letter case, fill colour, any outline or stroke with its colour and thickness relative to the stroke width of the letters, any drop shadow with its direction, distance and softness, any glow or blur, any emphasis applied to individual words or characters and how it differs from the rest, the position within the frame and the distance from the nearest edges, and how the text enters, changes and leaves during the shot.\n\nReturn natural language evidence only.`,
        instruction: "Observe the appearance of on-screen text only. Do not name SVML components, do not write markup, and do not name font files or style properties from any software.",
      } }));
      const audioTasks: ObservationTask[] = selected.map((shot) => {
        const previous = state.shots.find((candidate) => candidate.index === shot.index - 1);
        return { key: `audio:${shot.shot_id}`, request: {
          media: [shot.clip_ref, ...(previous?.audio_tail_ref == null ? [] : [previous.audio_tail_ref])],
          sound: true,
          prompt: `${globalContext}\n\nListen to shot ${shot.index}. Decide who is speaking, whether sound continues from the previous shot, whether visible people actually produce the sound, and whether a silent B-roll person only appears to speak. Handle off-screen, alternating, overlapping, and no-person-visible speech. Return natural language evidence only.`,
          instruction: "Observe sound only. Do not write markup, SVML, JSON plans, or component names.",
        } };
      });
      // Both boundary questions look at exactly the same three files, so they travel together. Asking
      // them separately uploaded two clips twice to learn two things about one cut.
      const boundaryTasks: ObservationTask[] = boundaryRights.map((right) => {
        const left = state.shots.find((shot) => shot.index === right.index - 1)!;
        return { key: `boundary:${right.shot_id}`, request: {
          media: [left.clip_ref, right.clip_ref, left.tail_frame_ref],
          sound: true,
          prompt: `Compare shots ${left.index} and ${right.index}, which meet at one cut. Answer two questions separately, each under its own heading.\n\nContinuous camera shot: are these one continuous camera shot, or two? Explain the visual and sound continuity evidence.\n\nOverlay continuity: does the same visible overlay or inserted picture continue across the boundary, change, or end? Explain the evidence.\n\nReturn natural language evidence only.`,
          instruction: "Analyze what happens at one cut. Do not name SVML components or write code.",
        } };
      });
      const allTasks = [...visualTasks, ...typeTasks, ...audioTasks, ...boundaryTasks];
      const reobserve = input.reobserve === true;
      const forcedKeys = reobserve ? new Set(allTasks.map((task) => task.key)) : new Set<string>();
      const observations = await runObservationTasks(state.root, allTasks, forcedKeys, concurrency, gapMs, ask);
      const unresolved = [...observations].filter(([, value]) => value.status !== "complete").map(([key]) => key);
      const boundaryText = boundaryRights.map((right) => observations.get(`boundary:${right.shot_id}`)?.text ?? "").join("\n");
      const needsThreeShotReview = selected.length >= 3 && (
        reobserve ||
        /uncertain|unknown|possibly|may be|contin(?:ue|ues)|same take|same shot/iu.test(boundaryText)
      );
      const windows = (needsThreeShotReview
        ? selected.flatMap((shot, index) => {
            const window = selected.slice(index, index + 3);
            return window.length === 3 && window[1]!.index === shot.index + 1 && window[2]!.index === shot.index + 2
              ? [window]
              : [];
          })
        : []).map((items) => items as unknown as readonly [Shot, Shot, Shot]);
      // A three-shot review is an observation like any other, so it is cached like any other. Asking
      // for it directly meant an answer recorded against its key was never read back, which left the
      // review unanswerable for an observer that answers out of band.
      const windowTasks: ObservationTask[] = windows.map((items) => ({
        key: `window:${items[0].shot_id}`,
        request: {
          media: items.map((shot) => shot.clip_ref),
          prompt: `Compare shots ${items[0].index}, ${items[1].index}, and ${items[2].index}. Decide whether the three clips are one continuous camera shot and whether one visual overlay or insert persists through both boundaries. Explain the evidence in natural language only.`,
          instruction: "Analyze a three-shot continuity window only. Do not write markup, SVML, JSON plans, or component names.",
        },
      }));
      const windowObservations = await runObservationTasks(
        state.root, windowTasks,
        reobserve ? new Set(windowTasks.map((task) => task.key)) : new Set<string>(),
        concurrency, gapMs, ask,
      );
      const threeShotObservations = windows.map((items) => ({
        shot_ids: items.map((shot) => shot.shot_id),
        combined_duration_seconds: Number((items[2].end_seconds - items[0].start_seconds).toFixed(3)),
        result: windowObservations.get(`window:${items[0].shot_id}`)!,
      }));
      for (const window of threeShotObservations) {
        if (window.result.status !== "complete") unresolved.push(`three-shot:${window.shot_ids.join("+")}`);
      }
      const shotResults = selected.map((shot) => ({
        shot_id: shot.shot_id,
        visual: observations.get(`visual:${shot.shot_id}`)!,
        text_appearance: observations.get(`type:${shot.shot_id}`)!,
        audio: observations.get(`audio:${shot.shot_id}`)!,
      }));
      const boundaryResults = boundaryRights.map((right) => {
        const left = state.shots.find((shot) => shot.index === right.index - 1)!;
        return {
          left_shot_id: left.shot_id,
          right_shot_id: right.shot_id,
          combined_duration_seconds: Number((right.end_seconds - left.start_seconds).toFixed(3)),
          within_15_seconds: right.end_seconds - left.start_seconds <= 15,
          continuity: observations.get(`boundary:${right.shot_id}`)!,
        };
      });
      return {
        reference_id: state.reference_id,
        observer,
        shots: shotResults,
        boundaries: boundaryResults,
        three_shot_observations: threeShotObservations,
        unresolved,
        pending_observations: pending,
      };
    },

    async inspect_svml_vocabulary(input): Promise<Record<string, unknown>> {
      assert(input.package_names.length > 0, "package_names must not be empty");
      const loaded = await loadNodePackageSelection(input.package_names, packageRoot);
      const requested = input.tags === undefined ? undefined : new Set(input.tags);
      const surfaces: Record<string, unknown>[] = [];
      for (const pack of loaded) {
        for (const facet of pack.contribution.hostFacets ?? []) {
          const implementation = facet.implementation as RegisteredSurface;
          if (requested !== undefined && !requested.has(implementation.tag) && !requested.has(implementation.surface)) continue;
          surfaces.push({
            package_name: pack.specifier,
            module: implementation.module,
            surface: implementation.surface,
            tag: implementation.tag,
            mode: implementation.mode,
            outputs: implementation.outputs,
            vocabulary: vocabularyForResult(input.include_previews === false ? withoutPreview(implementation.vocabulary) : implementation.vocabulary),
            readme_path: readmePath(pack.specifier, packageRoot),
          });
        }
      }
      return { packages: input.package_names, surfaces };
    },

    async compare_reconstruction(input): Promise<Record<string, unknown>> {
      const state = await loadState(input.reference_id);
      const root = stateRoot(workspaceRoot, state.reference_id);
      const named = [input.shot_id, input.segment, input.selection].filter((value) => value !== undefined);
      assert(named.length === 1, "name exactly one of shot_id, segment and selection");
      const supplied = [input.image_path, input.video_path].filter((value) => value !== undefined);
      assert(supplied.length === 1, "supply exactly one of image_path and video_path");
      const clip = input.video_path !== undefined;
      const renderedPath = resolve(String(supplied[0]));
      const file = await stat(renderedPath).catch(() => undefined);
      assert(file?.isFile(), `${clip ? "video_path" : "image_path"} is not a file: ${renderedPath}`);
      const scope = input.question?.trim() ?? "";
      const standIn = await standInBeside(renderedPath);
      const observer: Observer = state.observer ?? "gemini";
      const { ask, pending } = await askerFor(observer, state);

      // Which stretch of the reference the render is put beside. A render covers the words a Segment
      // or a Selection marks, so that is what the reference is cut to; a shot is a cut in the picture
      // and is compared as the whole shot it already is.
      let shot: Shot | undefined;
      let cut: RangeCut | undefined;
      let referenceMedia: string;
      let renderedMedia = renderedPath;
      let stretchSeconds: number;
      if (input.shot_id !== undefined) {
        shot = state.shots.find((candidate) => candidate.shot_id === input.shot_id);
        assert(shot !== undefined, `shot ${input.shot_id} does not exist in reference ${input.reference_id}`);
        referenceMedia = clip ? shot.clip_ref : shot.representative_frame_ref;
        stretchSeconds = shot.duration_seconds;
      } else {
        assert(input.run !== undefined,
          "run is required with segment or selection: the words are read from the Run's Author SVML");
        const { path: svmlPath } = await authorSource(resolve(invokedFrom(), input.run));
        const focus: StandInFocus = {
          ...(input.segment === undefined ? {} : { segment: input.segment }),
          ...(input.selection === undefined ? {} : { selection: input.selection }),
        };
        const range = await spokenRange(svmlPath, focus, await referenceWords(state.reference_id));
        cut = await cutWordRange(state, root, focus, range, renderedPath, clip);
        referenceMedia = cut.reference;
        renderedMedia = cut.rendered;
        stretchSeconds = cut.seconds;
      }

      // A clip comparison reads the whole stretch on both sides. The observer that reads video is
      // given the two clips; the observer that reads pictures is given two frame tiles, which is the
      // same degradation `prepare_reference` already applies to a shot. Tiling both against the same
      // duration makes `tileFrames` choose the same frame count and layout for each, so the two grids
      // are read side by side rather than as different samplings.
      if (clip && observer === "agent") {
        if (shot !== undefined) {
          assert(shot.frames_tile_ref !== null,
            `shot ${shot.shot_id} has no frame tile; re-prepare the reference with --redo all --observer agent`);
          referenceMedia = shot.frames_tile_ref;
          renderedMedia = await shotTile(renderedPath, stretchSeconds, join(root, "shots", `${shot.shot_id}-reconstruction.jpg`));
        } else {
          // A word range is cut when it is asked for, so neither side has a prepared tile and both
          // are built here, from the two cuts.
          referenceMedia = await shotTile(cut!.reference, stretchSeconds, cut!.referenceTile);
          renderedMedia = await shotTile(cut!.rendered, stretchSeconds, cut!.renderedTile);
        }
      }

      const unit = clip && observer !== "agent" ? "video clips" : "still images";
      // TILE_PREAMBLE already tells the agent observer how to read a grid, so this adds only what is
      // new about a pair of them: both are stretches, and they are compared as sequences.
      const reading = clip && observer === "agent"
        ? "\n\nBoth are grids, so compare them as sequences rather than as single moments."
        : "";
      const differences = await ask("comparison", {
        media: [referenceMedia, renderedMedia],
        instruction: `You compare two supplied ${unit} and describe their visible differences in natural language only. You are not told how either was made. Do not write code, markup, SVML, component names, or production advice.`,
        prompt: `Two ${unit} are supplied in order: one, then two.${reading}${cut?.incomplete ?? ""}${scope.length === 0 ? "" : `\n\nLimit the comparison to this: ${scope}`}\n\nDescribe every visible difference between them: layout and arrangement, the position and size of each element, cropping and margins, colour, typeface, weight, letter and line spacing, alignment, outline or stroke, shadow, glow, borders and corner treatment, and anything present in one and absent from the other.${clip ? " Also describe differences in what changes over the stretch: what appears, what leaves, in what order, and how anything moves." : ""} State plainly which differences are large enough to read as a different design and which are minor. If they are visually equivalent, say exactly that.\n\nDo not speculate about how either was produced, which one is a source, or which one is a copy. Return natural language only.`,
      });
      // The answer is deliberately not cached — every iteration is a fresh comparison. What is
      // recorded is that a comparison happened, so a gate can tell an element that was looked at
      // from one that never was. The loop is allowed to stop with differences remaining, so this
      // records participation rather than convergence.
      await appendComparison(root, {
        at: new Date().toISOString(),
        ...(shot === undefined ? {} : { shot_id: shot.shot_id }),
        ...(cut === undefined ? {} : { range: cut.record }),
        ...(input.element === undefined ? {} : { element: input.element.trim() }),
        image_path: renderedPath,
        image_digest: await fileDigest(renderedPath),
        observer,
        status: differences.status,
        scoped: scope.length > 0,
        clip,
        ...(standIn === undefined ? {} : { stand_in: standIn }),
      });
      return {
        reference_id: state.reference_id,
        observer,
        ...(shot === undefined ? {} : { shot_id: shot.shot_id }),
        ...(cut === undefined ? {} : {
          range: cut.record,
          ...(clip ? { reference_seconds: cut.referenceSeconds, rendered_seconds: cut.renderedSeconds } : {}),
          ...(cut.incomplete.length === 0 ? {} : { incomplete_ends: cut.incomplete.trim() }),
        }),
        compared: clip ? "clip" : "still",
        reference_ref: referenceMedia,
        rendered_ref: renderedMedia,
        ...(standIn === undefined ? {} : { stand_in: standIn }),
        differences,
        unresolved: differences.status === "complete" ? [] : ["differences"],
        pending_observations: pending,
      };
    },

    // The `agent` observer answers in its own context, so the answer comes back through here rather
    // than through a return value. The four whole-reference observations live in the state and the
    // rest in the observation cache, which is where each one was already read from.
    async record_observation(input): Promise<Record<string, unknown>> {
      const state = await loadState(input.reference_id);
      assert(state.observer === "agent", `reference ${input.reference_id} is read by the ${state.observer ?? "gemini"} observer, which records its own answers`);
      const key = input.key.trim();
      assert(key.length > 0, "key is required");
      const text = input.text.trim();
      assert(text.length > 0, "text is required; an observation that saw nothing says so in words");
      const root = stateRoot(workspaceRoot, input.reference_id);
      if (WHOLE_REFERENCE_KEYS.includes(key as typeof WHOLE_REFERENCE_KEYS[number])) {
        const field = key as typeof WHOLE_REFERENCE_KEYS[number];
        await writeJson(join(root, "state.json"), { ...state, [field]: observation("complete", text) });
        return { reference_id: state.reference_id, key, stored_in: "state" };
      }
      const shotKeys = new Set(state.shots.flatMap((shot) => [`visual:${shot.shot_id}`, `type:${shot.shot_id}`, `audio:${shot.shot_id}`, `boundary:${shot.shot_id}`, `window:${shot.shot_id}`]));
      assert(shotKeys.has(key), `key ${key} is not an observation of reference ${input.reference_id}`);
      const path = join(root, "observations.json");
      const cache = await readJson<Record<string, Observation>>(path) ?? {};
      cache[key] = observation("complete", text);
      await writeJson(path, cache);
      return { reference_id: state.reference_id, key, stored_in: "observations" };
    },

    // A media slot that is declared as a generation is not fillable by this route, which never
    // Builds. The comparison loop still needs a still to compare, so the slot is mocked with a
    // fixed, correctly-sized placeholder — the same tool on every run, never a real generation and
    // never a script the agent writes by hand.
    async make_placeholder(input): Promise<Record<string, unknown>> {
      return await writePlaceholder({
        out: String(input.out),
        width: positiveInt(Number(input.width), "width"),
        height: positiveInt(Number(input.height), "height"),
        ...(input.color === undefined ? {} : { color: String(input.color) }),
        ...(input.video === true ? { video: true } : {}),
        ...(input.seconds === undefined ? {} : { seconds: positiveInt(Number(input.seconds), "seconds") }),
      });
    },

    async render_element(input): Promise<Record<string, unknown>> {
      return await renderElement(input);
    },

    async render_previews(input): Promise<Record<string, unknown>> {
      return await renderPreviews(input);
    },

    async preview_check(input): Promise<Record<string, unknown>> {
      return await previewCheck(input, { packageRoot });
    },

    async reconstruction_check(input): Promise<Record<string, unknown>> {
      return await reconstructionCheck(input, { workspaceRoot, packageRoot });
    },
  };
}

const WHOLE_REFERENCE_KEYS = ["people_and_product", "voices", "persistent_systems", "places"] as const;

function vocabularyForResult(value: SurfaceVocabulary | undefined): unknown {
  if (value === undefined) return undefined;
  return {
    ...value,
    ...(value.preview === undefined ? {} : {
      preview: { mediaType: value.preview.mediaType, path: value.preview.path },
    }),
  };
}

function withoutPreview(value: SurfaceVocabulary | undefined): SurfaceVocabulary | undefined {
  if (value === undefined) return undefined;
  const { preview: _preview, ...rest } = value;
  return rest;
}

function readmePath(specifier: string, root: string): string | undefined {
  try {
    const require = createRequire(join(root, "__hypit_reference_tools__.cjs"));
    const entry = require.resolve(specifier) as string;
    let cursor = dirname(entry);
    while (cursor !== dirname(cursor)) {
      try {
        const candidate = join(cursor, "package.json");
        const packageJson = require(candidate) as { name?: string };
        if (packageJson.name === specifier) return join(cursor, "README.md");
      } catch { /* keep walking */ }
      cursor = dirname(cursor);
    }
    return undefined;
  } catch { return undefined; }
}
