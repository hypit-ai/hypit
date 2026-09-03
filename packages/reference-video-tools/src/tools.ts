import { access, appendFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { deflateSync } from "node:zlib";
import { basename, dirname, join, resolve } from "node:path";
import { loadNodePackageSelection, locateNodePackage, physicalPackageName } from "@hypit/package-loader-node";
import { OsCredentialStore } from "@hypit/credential-store-os";
import { credentialRef } from "@hypit/runtime";
import { markupSurfaceHostFacetAbi } from "@hypit/markup";
import type { RegisteredSurface, SurfaceVocabulary } from "@hypit/markup";
import { exactModelHostAbi } from "@hypit/model-kit";
import type { ValueSchema } from "@hypit/protocol";
import {
  visualPathCommandSchema, visualTextDocumentSchema, visualTextFlowSchema,
  visualTextPaintSchema, visualTextTypographySchema, visualTrackSchema,
  visualBoxSchema, visualMaskSchema, visualTextSchema, visualImageSchema,
  visualVideoSchema, visualSurfaceSchema, visualElementSchema,
  animatableLocalStyles,
} from "@hypit/composition";
import { VISUAL_STYLE_ENUM_VALUES_V1, VISUAL_STYLE_NAMES_V1 } from "@hypit/visual-ir";

import { describeSchema } from "./schema.js";
import { videoCliDistribution } from "@hypit/video-cli";
import { createHypiHubGeminiGenerator } from "@hypit/provider-hypihub";
import { createVertexGeminiGenerator } from "@hypit/provider-vertex";
import type { GeminiInlinePart } from "@hypit/gemini";

import { authorSource, invokedFrom, nearestPackageRoot, referenceRoot, referenceWords, renderElement, renderPreviews, spokenRange, standInSidecarPath, tokenWindow } from "./authoring.js";
import type { RenderElementInput, RenderPreviewsInput, SpokenRange, StandInFocus, StandInSidecar } from "./authoring.js";
import { downloadReferenceVideo, isReferenceUrl } from "@hypit/yt-dlp";
import { loadStudioCompanionRegistry } from "@hypit/studio/src/companion-profile.js";
import { openStudioBuildLibrary } from "@hypit/studio/src/build-library.js";
import { loadStudioDomain } from "@hypit/studio/src/domain.js";
import { loadStudioRun } from "@hypit/studio/src/run.js";
import { authoringCheck, previewCheck, reviewLogPath, scriptCueCheck } from "./checks.js";
import type { AuthoringCheckInput, PreviewCheckInput, ReconstructionCheckInput, ScriptCueCheckInput } from "./checks.js";
import { layoutAccept, layoutCheck } from "./layout.js";
import type { LayoutAcceptInput, LayoutCheckInput } from "./layout.js";
import {
  assert,
  completelyStill,
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
  tileFrames,
  writeJson,
} from "./media.js";
import { prepareTranscript, whisperxHealth } from "./transcript.js";
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
  /**
   * A round of narrow questions, asked together. Each entry names its own shots and its own question
   * and inherits `reference_id`; each `shot_ids` array must contain exactly one shot. No narrow
   * question's answer depends on another's, which is why the route asks them at once — and why asking
   * them one process at a time was a shell loop.
   */
  readonly questions?: readonly { readonly shot_ids: readonly string[]; readonly question: string }[];
};
export type RecordObservationInput = {
  readonly reference_id: string;
  /** Optional Run used to place comparison observations beside the project that requested them. */
  readonly run?: string;
  readonly key?: string;
  readonly text?: string;
  /**
   * A round of answers in one call.
   *
   * The `agent` observer answers everything by hand, and a reference of twenty shots owes an answer
   * for each of three questions about it, plus the boundaries, plus the four about the reference
   * itself. Handed out one call at a time that is seventy-odd invocations to close one sweep.
   */
  readonly answers?: readonly { readonly key: string; readonly text: string }[];
};
export type InspectVocabularyInput = {
  readonly package_names: readonly string[];
  readonly tags?: readonly string[];
  readonly include_previews?: boolean;
  readonly run?: string;
};
export type ValidateLocalAuthorPackagesInput = {
  readonly run: string;
  /** Runtime Profile used to resolve accepted Build Records in a pinned Run. */
  readonly runtime?: string;
  readonly expected_packages?: readonly string[];
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
  /** A half-open token range, for a stretch the Script never named. See `StandInFocus`. */
  readonly tokens?: readonly [number, number];
  /** The Run whose Author SVML the words are read from. Required with a word range. */
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
   * to the observer: the comparison stays blind, and this is what lets a later report tell which
   * elements have been compared and which have never been looked at.
   */
  readonly element?: string;
  /** Maximum frame-domain difference tolerated when matching the two independently encoded cuts. */
  readonly tolerance_frames?: number;
  /**
   * A whole round of comparisons, run together. Each entry names its own stretch, render and element
   * exactly as a single call does, and inherits `reference_id` from the outer input. The route renders
   * every element before it compares any of them, so a round is a list by the time it starts.
   */
  readonly comparisons?: readonly Omit<CompareReconstructionInput, "reference_id" | "comparisons">[];
};

/**
 * One element of a description-authored program, read against what it was asked to be.
 *
 * The counterpart of `compare_reconstruction` on the route with no reference. There is nothing to
 * differ from, so the question is conformance: does the picture match the description, and what is
 * visibly wrong with it. That makes it one-sided, which is the only structural difference — the
 * render is prepared the same way, the log has the same shape, and the same report reads it.
 *
 * There is no observer choice here. The picture is a local render and nobody is billed to look at it,
 * so the task always comes back to be answered rather than being sent anywhere.
 */
export type ReviewElementInput = {
  /** The Run whose Author SVML the words are read from, and the project the log belongs to. */
  readonly run: string;
  /**
   * Which element the findings are credited to. Required on a single review and asserted there — a
   * review credited to nothing is a picture nobody can say was looked at. Optional in the type only
   * because a `--batch` call carries it per entry rather than at the top.
   */
  readonly element?: string;
  /** The window the render covers, named in words. Exactly one is given. */
  readonly segment?: string;
  readonly selection?: string;
  /** A half-open token range, for a stretch the Script never named. See `StandInFocus`. */
  readonly tokens?: readonly [number, number];
  /** The render. Exactly one of `image_path` and `video_path` is given. */
  readonly image_path?: string;
  readonly video_path?: string;
  /**
   * What this element was asked to be, in the author's own words: the answers frozen when the brief
   * was taken and the appearance values written down before the Source was. Required, because a
   * conformance question with nothing to conform to is an invitation to invent a standard.
   */
  readonly intent?: string;
  readonly intent_file?: string;
  /** Which region to read, when the picture holds more than the element. Never what to conclude. */
  readonly question?: string;
  /** A whole round, run together. Each entry inherits `run` from the outer input. */
  readonly reviews?: readonly Omit<ReviewElementInput, "run" | "reviews">[];
};

export type RecordReviewInput = {
  readonly run: string;
  readonly review_id: string;
  readonly text: string;
};

export type { RenderElementInput, RenderPreviewsInput } from "./authoring.js";
export type { PreviewCheckInput, ReconstructionCheckInput } from "./checks.js";

export type ReferenceVideoTools = {
  list_svml_packages(): Promise<Record<string, unknown>>;
  prepare_reference(input: PrepareReferenceInput): Promise<PrepareResult>;
  observe_reference(input: ObserveReferenceInput): Promise<Record<string, unknown>>;
  inspect_svml_vocabulary(input: InspectVocabularyInput): Promise<Record<string, unknown>>;
  validate_local_author_packages(input: ValidateLocalAuthorPackagesInput): Promise<Record<string, unknown>>;
  validate_script_cues(input: ScriptCueCheckInput): Promise<Record<string, unknown>>;
  inspect_visual_schema(input: { readonly shape?: string; readonly producers?: readonly string[] }): Promise<Record<string, unknown>>;
  paths(): Promise<Record<string, unknown>>;
  compare_reconstruction(input: CompareReconstructionInput): Promise<Record<string, unknown>>;
  record_observation(input: RecordObservationInput): Promise<Record<string, unknown>>;
  review_element(input: ReviewElementInput): Promise<Record<string, unknown>>;
  record_review(input: RecordReviewInput): Promise<Record<string, unknown>>;
  render_element(input: RenderElementInput): Promise<Record<string, unknown>>;
  render_previews(input: RenderPreviewsInput): Promise<Record<string, unknown>>;
  preview_check(input: PreviewCheckInput): Promise<Record<string, unknown>>;
  layout_check(input: LayoutCheckInput): Promise<Record<string, unknown>>;
  layout_accept(input: LayoutAcceptInput): Promise<Record<string, unknown>>;
  reconstruction_check(input: ReconstructionCheckInput): Promise<Record<string, unknown>>;
  /** The corresponding direct report for a program authored from a description. */
  authoring_check(input: Omit<AuthoringCheckInput, "mode" | "reference_id">): Promise<Record<string, unknown>>;
};

type ToolOptions = {
  readonly packageRoot?: string;
  readonly model?: string;
  readonly concurrency?: number;
  readonly launchGapMs?: number;
  readonly retryDelayMs?: number;
  readonly generate?: GenerateText;
};
export type GenerateText = (input: { readonly parts: readonly GeminiInlinePart[]; readonly instruction: string }) => Promise<string>;
type ObservationTask = { readonly key: string; readonly request: Request };

let eventSequence = 0;

function eventId(label: string, at = new Date()): string {
  eventSequence += 1;
  const readable = label.trim().replace(/[^0-9A-Za-z._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "item";
  const time = at.toISOString().replace(/[-:.TZ]/gu, "");
  return `${readable}-${time}-${eventSequence.toString(36)}`;
}

function observation(status: Observation["status"], text: string): Observation { return { status, text }; }
function unavailable(reason: string): Transcript { return { status: "unavailable", transcript_ref: null, word_count: 0, reason }; }

function positiveEnv(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw.length === 0) return undefined;
  const value = Number(raw);
  assert(Number.isSafeInteger(value) && value > 0, `${name} must be a positive integer`);
  return value;
}

/**
 * Where one reference's prepared state lives.
 *
 * `referenceRoot` finds the Hypit tree from this module's own location, so the directory
 * `prepare_reference` writes to is the directory every other command reads from, whichever directory
 * the command was run in.
 */
function stateRoot(reference: string): string {
  return join(referenceRoot(), reference);
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
  /** The word range, when the caller gave one directly rather than naming a marked stretch. */
  readonly tokens?: readonly [number, number];
  readonly words: string;
  readonly words_start_seconds: number;
  readonly words_end_seconds: number;
  readonly cut_start_seconds: number;
  readonly cut_end_seconds: number;
  readonly head_snapped: boolean;
  readonly tail_snapped: boolean;
};

/** One line per comparison performed, appended so a stopped round still leaves its trail. */
export type ComparisonRecord = {
  readonly at: string;
  /**
   * Names this comparison so an observer that answers out of band can close it. The `agent` observer
   * is handed the pair and the question and returns nothing in band, so without a name the entry
   * stayed `pending` for ever and a report had to choose between crediting an unanswered comparison and
   * crediting none of them.
   */
  readonly id: string;
  /** The project Run, when this comparison was made over a word range. */
  readonly run?: string;
  /** Which stretch was compared. A comparison names its shot or its word range, never both. */
  readonly shot_id?: string;
  readonly range?: ComparedRange;
  readonly element?: string;
  readonly image_path: string;
  readonly observer: Observer;
  readonly status: Observation["status"];
  readonly scoped: boolean;
  /** What the observer was told to limit itself to, when anything was. */
  readonly scope?: string;
  /** Whether the whole shot was compared as a clip, or one frame of it as a still. */
  readonly clip?: boolean;
  /**
   * What timed the stand-in the picture was drawn over, from the sidecar `render_element` writes
   * beside its output. Present when the picture came from `render_element`.
   */
  readonly stand_in?: StandInSidecar;
  /** The differences, once an out-of-band observer has recorded them. */
  readonly differences?: string;
};

/**
 * One line per element review on the route that has no reference to compare against.
 *
 * The fields it shares with `ComparisonRecord` are spelled the same, so reports read one shape from
 * either log without an adapter. What differs is the question: a comparison reports how two pictures
 * differ, and a review reports whether one picture is what it was asked to be — so it carries the
 * intent it was judged against, and its answer is `findings`.
 */
export type ReviewRecord = {
  readonly at: string;
  readonly id: string;
  /** Always present. `review_element` requires `--element`, so a review credits one by construction. */
  readonly element: string;
  /**
   * The window, named the way it was asked for. Only the name: `ComparedRange` also carries where the
   * reference speaks those words and how the cut was snapped to its shot boundaries, and none of that
   * exists here. Reports read the name and nothing else from either log.
   */
  readonly range?: { readonly segment?: string; readonly selection?: string; readonly tokens?: readonly [number, number] };
  readonly image_path: string;
  readonly status: Observation["status"];
  readonly scope?: string;
  readonly clip?: boolean;
  readonly stand_in?: StandInSidecar;
  /** What this element was asked to be, in the author's own words. */
  readonly intent: string;
  /** What the reader found, once it has come back. */
  readonly findings?: string;
};

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

/**
 * One line per look performed, appended so a stopped round still leaves its trail.
 *
 * Two logs have this shape and the same three operations over it. A comparison of a reconstruction
 * against its reference is kept under the reference, and its answer is the differences; a review of a
 * description-authored element against what it was asked to be is kept under the project, and its
 * answer is the findings. Nothing else about appending, closing or recognising an answered entry
 * differs, so the file and the name of the answer are arguments rather than a second copy.
 */
type LookLog = {
  readonly root: string;
  readonly file: string;
  /** Which field carries the answer, and therefore what tells an open entry from a closed one. */
  readonly answer: "differences" | "findings";
};

const comparisonLog = (root: string): LookLog => ({ root, file: "comparisons.jsonl", answer: "differences" });

/** Comparisons are evidence for one reconstruction, not for the shared reference. */
function comparisonLogForRun(run: string | undefined, referenceRootPath: string): LookLog {
  return run === undefined
    ? comparisonLog(referenceRootPath)
    : comparisonLog(join(dirname(resolve(invokedFrom(), run)), ".hypit"));
}
const reviewLog = (root: string): LookLog => ({ root, file: "reviews.jsonl", answer: "findings" });

async function appendLooked(log: LookLog, record: ComparisonRecord | ReviewRecord): Promise<void> {
  await serially(log.root, async () => {
    await mkdir(log.root, { recursive: true });
    await appendFile(join(log.root, log.file), `${JSON.stringify(record)}\n`, "utf8");
  });
}

/**
 * Record the differences against the comparison that asked for them, and mark it answered.
 *
 * The log is append-only while a round runs, so closing an entry rewrites the file. That is a
 * read-modify-write over the same bytes `appendLooked` appends to, so both go through the same
 * queue — a round fired at once would otherwise drop whichever line landed between the read and the
 * write. Returns false when no entry carries the id, which is what a mistyped one looks like.
 */
async function closeLooked(log: LookLog, id: string, text: string): Promise<boolean> {
  return await serially(log.root, async () => {
    const path = join(log.root, log.file);
    const lines = (await readFile(path, "utf8").catch(() => "")).split("\n").filter((line) => line.trim().length > 0);
    let found = false;
    const rewritten = lines.map((line) => {
      let record: ComparisonRecord;
      try { record = JSON.parse(line) as ComparisonRecord; } catch { return line; }
      if (record.id !== id) return line;
      found = true;
      return JSON.stringify({ ...record, status: "complete", [log.answer]: text });
    });
    if (found) await writeFile(path, `${rewritten.join("\n")}\n`, "utf8");
    return found;
  });
}

/**
 * One writer at a time per reference, within this process.
 *
 * `observations.json`, `state.json` and `comparisons.jsonl` are each read, changed and written back.
 * The `agent` observer answers a round of observations with one call per answer, and those calls
 * arrive together, so two of them reading the same cache before either writes is how an answer
 * disappears with no error anywhere. Between processes this holds nothing; the route runs one.
 */
const writeQueues = new Map<string, Promise<unknown>>();
async function serially<T>(root: string, work: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(root) ?? Promise.resolve();
  const next = previous.then(work, work);
  writeQueues.set(root, next.catch(() => undefined));
  return await next;
}



function positiveInt(value: number, label: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${label} must be a positive integer.`);
  return value;
}

async function defaultGenerate(model: string): Promise<GenerateText> {
  const hypiHubKey = await resolveHypiHubApiKey();
  const backend = process.env.HYPIT_GEMINI_PROVIDER?.trim().toLowerCase() || "auto";
  if (backend !== "auto" && backend !== "hypihub" && backend !== "vertex") {
    throw new Error("HYPIT_GEMINI_PROVIDER must be auto, hypihub or vertex");
  }
  if (backend === "hypihub" || (backend === "auto" && hypiHubKey)) {
    if (!hypiHubKey) throw new Error("HYPIT_GEMINI_PROVIDER=hypihub requires HypiHub OAuth; run hypit auth login hypihub.default");
    const generate = createHypiHubGeminiGenerator({
      apiKey: hypiHubKey,
      model,
      baseUrl: process.env.HYPIHUB_BASE_URL?.trim() || "https://hypit.ai",
    });
    return async ({ parts, instruction }) => {
      try {
        return await generate({ parts: parts as unknown as Parameters<typeof generate>[0]["parts"], instruction });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/hypit\.ai/iu.test(message) && /HTTP (401|403|404)\b|model_not_found|no_capable_provider/iu.test(message)) {
          throw new Error(`${message}. Sign in at https://hypit.ai with hypit auth login to enable this Gemini model`);
        }
        throw error;
      }
    };
  }
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  if (!project || !credentials) {
    throw new Error("Gemini credentials are unavailable. Configure Vertex credentials or sign in to HypiHub with hypit auth login.");
  }
  const generate = createVertexGeminiGenerator({
    project,
    credentials,
    model,
    location: process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global",
  });
  return async ({ parts, instruction }) => {
    try {
      return await generate({ parts, instruction });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/hypit\.ai/iu.test(message) && /\b(?:401|403|404)\b|permission denied|unauthenticated|not found|failed precondition/iu.test(message)) {
        throw new Error(`${message}. This Gemini model or Vertex credential is unavailable; sign in at https://hypit.ai with hypit auth login`);
      }
      throw error;
    }
  };
}

/** Resolve the HypiHub credential written by `hypit auth login`, with env fallback. */
async function resolveHypiHubApiKey(): Promise<string | undefined> {
  if (process.platform === "darwin" || process.platform === "win32") {
    const value = await new OsCredentialStore()
      .resolve(credentialRef("os", "hypihub.oauth"))
      .catch(() => undefined);
    const secret = value?.secret?.trim();
    if (secret) return secret;
  }
  return process.env.HYPIHUB_API_KEY?.trim() || undefined;
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
function mediaParts(): (path: string) => Promise<GeminiInlinePart> {
  const encoded = new Map<string, Promise<GeminiInlinePart>>();
  return (path) => {
    const held = encoded.get(path);
    if (held !== undefined) return held;
    const part = (async (): Promise<GeminiInlinePart> => {
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

async function callSafely(retryDelayMs: number, generate: GenerateText, parts: readonly GeminiInlinePart[], instruction: string): Promise<Observation> {
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
    // Sound has no picture to stand in for it, so it is left out rather than handed over as a file the
    // agent cannot read. Everything else has to be a picture this observer can actually open: the
    // observer that uploads refuses an unknown extension outright, and passing one through here handed
    // the agent a path and called it evidence.
    else if (!path.toLowerCase().endsWith(".wav")) {
      assert(/\.(jpg|jpeg|png|webp)$/iu.test(path),
        `${path} is not a picture the agent observer can read; supported: jpg, jpeg, png, webp`);
      pictures.push(path);
    }
  }
  return [...new Set(pictures)];
}

// What the pictures are has to be said, because a tile of frames is not what the prompt was written
// for. The prompt itself is unchanged on both paths: only this preamble is added, and only here.
const TILE_PREAMBLE = "Each supplied picture that shows a grid of frames is one shot, sampled evenly"
  + " across its duration and laid out in reading order: left to right, then top to bottom. Read the"
  + " grid as time passing. A single picture that is not a grid is one moment.";
const WATERMARK_RULE = "If a visible mark is clearly a platform UI, player chrome, export-tool or editing-software watermark/overlay rather than authored video content, ignore it and do not report it as a difference or repair target. If its provenance is uncertain or it may be an authored design element, keep it as an uncertainty instead of silently ignoring it.";
// There is no second source of sound to fall back to, so this says how to answer from what there is
// rather than leaving the observation short. The transcript settles when speech happens; the picture
// settles who is on screen while it does. Read together they carry the question far enough to answer.
// The two fields are named rather than described: an instruction to use the transcript, given to a
// reader with no way to find it, is answered without one.
const NO_SOUND = "You are reading pictures and cannot hear this reference. Answer from the pictures and"
  + " the measured transcript together: the transcript says exactly when words are spoken, and the"
  + " pictures say who is on screen and whose mouth is moving while they are. The words this task's own"
  + " stretch contains are supplied as `transcript_words`, and the whole measured transcript is the file"
  + " at `transcript_ref`. Attribute speech to the person the pictures show speaking during the words the"
  + " transcript places there, and answer the question in full rather than deferring the parts that would"
  + " be easier with sound.";

/** Declares one observation: what it asks, and the evidence it asks over. The observer decides how. */
type Request = {
  readonly media: readonly string[];
  readonly prompt: string;
  readonly instruction: string;
  /** True when answering needs sound. The `agent` observer has none and is told to say so. */
  readonly sound?: boolean;
  /**
   * The shots this question is asked over, when it is asked over shots rather than the whole video.
   *
   * Only a sound question reads it, and only on the observer that cannot hear: it is what narrows the
   * measured transcript to the words this task's own stretch contains. A question over the whole
   * reference leaves it unset and is given the whole transcript instead.
   */
  readonly shots?: readonly Shot[];
};
type Asker = (key: string, request: Request) => Promise<Observation>;

/**
 * Attempt every entry of a `--batch` round, and keep one entry's failure to itself.
 *
 * Four commands take a batch and all four want the same thing from it: every entry attempted, the
 * ones that threw reported beside the input that produced them, and the rest returned whole. Written
 * out per command that was the same twenty lines four times, differing only in the noun.
 *
 * What stays at the call site is the result's own shape — `compared`/`comparisons`,
 * `reviewed`/`reviews` — because that is the part a reader of the output is looking for, and a helper
 * that also invented those names would need an argument per noun to say nothing extra.
 */
/** A round that reaches no Provider: bounded by the machine's cores rather than by anyone's quota. */
const locallyPaced = (items: number) => ({ concurrency: Math.max(1, Math.min(cpus().length - 1, items)), gapMs: 0 });

async function runBatch<T>(
  items: readonly T[],
  rate: { readonly concurrency: number; readonly gapMs: number },
  run: (item: T) => Promise<Record<string, unknown>>,
): Promise<{
  readonly done: readonly Record<string, unknown>[];
  readonly failures: readonly { readonly error: string; readonly input: T }[];
}> {
  const settled = await pacedMap(items, rate.concurrency, rate.gapMs, async (item) => {
    try { return { ok: true as const, value: await run(item) }; }
    catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : String(error), input: item }; }
  });
  return {
    done: settled.flatMap((item) => item.ok ? [item.value] : []),
    failures: settled.flatMap((item) => item.ok ? [] : [{ error: item.error, input: item.input }]),
  };
}

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
  // Only an answer is cached. A pending one is a task handed out, and a failed one is the error that
  // ended the attempt; either, written, is read back by whatever quotes an observation's text.
  // Both still reach the caller through `answers`, so `unresolved` reports them.
  await serially(root, async () => {
    // Re-read inside the queue: `record_observation` may have written an answer to a different key
    // between the read above and here, and the copy taken then no longer holds it.
    const current = await readJson<Record<string, Observation>>(path) ?? {};
    for (const item of completed) if (item.value.status === "complete") current[item.key] = item.value;
    for (const [key, value] of Object.entries(current)) cache[key] = value;
    await writeJson(path, current);
  });
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
  /** Where each side's single frame goes, for a stretch that turns out to hold one picture. */
  readonly referenceStill: string;
  readonly renderedStill: string;
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
  slot: string,
): Promise<RangeCut> {
  const cuts = referenceCuts(state);
  const head = cuts.find((at) => at >= range.first.startSeconds && at < range.first.endSeconds);
  const tail = [...cuts].reverse().find((at) => at > range.last.startSeconds && at <= range.last.endSeconds);
  const start = head ?? range.startSeconds;
  const end = tail ?? range.endSeconds;
  const seconds = end - start;
  assert(seconds > 0, `${focus.selection ?? focus.segment} spans no time in the reference`);

  const label = focus.selection === undefined ? `segment-${focus.segment}` : `selection-${focus.selection}`;
  // One directory per call. Several elements are drawn over one Segment, so several comparisons name
  // the same word range, and the route runs them at once once every render is finished. Named from the
  // range alone they would write the same six files, and each would be reading the cut another was
  // still writing.
  const dir = join(root, "comparisons", label, slot);
  await ensureDir(dir);
  const reference = join(dir, `reference.${clip ? "mp4" : "jpg"}`);
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
    rendered = join(dir, "rendered.mp4");
    await cutClip(renderedPath, headFrames / drawn.frameRate, drawn.duration - (headFrames + tailFrames) / drawn.frameRate, rendered);
    referenceSeconds = (await probe(reference)).duration;
    renderedSeconds = (await probe(rendered)).duration;
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
      ...(focus.tokens === undefined ? {} : { tokens: focus.tokens }),
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
    referenceTile: join(dir, "reference-tile.jpg"),
    renderedTile: join(dir, "rendered-tile.jpg"),
    referenceStill: join(dir, "reference-still.jpg"),
    renderedStill: join(dir, "rendered-still.jpg"),
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
  const observations = {
    people_and_product: state.people_and_product ?? observation("failed", "not analyzed"),
    voices: state.voices ?? observation("failed", "not analyzed"),
    persistent_systems: state.persistent_systems ?? observation("failed", "not analyzed"),
    places: state.places ?? observation("failed", "not analyzed"),
  } as const;
  return {
    reference_id: state.reference_id,
    status: prepared(state) ? "ready" : "partial",
    video: state.video,
    shots: state.shots,
    storyboard_ref: state.storyboard_ref,
    transcript: state.transcript ?? unavailable("not transcribed"),
    ...observations,
    observations,
  };
}

export function createReferenceVideoTools(options: ToolOptions = {}): ReferenceVideoTools {
  const packageRoot = resolve(options.packageRoot ?? process.cwd());
  // Project-owned packages and the active Distribution are separate roots.  A project may import
  // @hypit modules without installing or linking them locally; every direct inspection path must
  // therefore carry the same Distribution fallback used by the compiler/Studio loaders.
  const packageLoading = () => videoCliDistribution.packageRoot === undefined
    ? {}
    : { fallbackRoots: [videoCliDistribution.packageRoot] };

  async function validateLocalAuthorPackages(input: ValidateLocalAuthorPackagesInput): Promise<Record<string, unknown>> {
    const runPath = resolve(invokedFrom(), input.run);
    const projectRoot = nearestPackageRoot(dirname(runPath)) ?? packageRoot;
    const packagesRoot = join(projectRoot, "packages");
    // Project package directories are discovered by their location and manifest, not by a
    // naming convention. A package created for one video may use any valid descriptive slug;
    // requiring a `local-` prefix would let other project-owned packages evade this validation.
    const projectPackageDirectories = (await readdir(packagesRoot, { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith("."))
      .map((entry) => join(packagesRoot, entry.name));
    const expected = new Set(input.expected_packages ?? []);
    const distributionPackageRoot = videoCliDistribution.packageRoot;
    const loading = distributionPackageRoot === undefined ? {} : { fallbackRoots: [distributionPackageRoot] };
    const runSource = await readFile(runPath, "utf8").catch(() => "");
    const authorSourcePath = /<author\s+source="([^"]+)"/u.exec(runSource)?.[1];
    const authorFile = authorSourcePath === undefined ? undefined : resolve(dirname(runPath), authorSourcePath);
    const imported = new Set<string>();
    const visitedSources = new Set<string>();
    const collectSourceClosure = async (file: string): Promise<void> => {
      const absolute = resolve(file);
      if (visitedSources.has(absolute)) return;
      visitedSources.add(absolute);
      const source = await readFile(absolute, "utf8").catch(() => "");
      for (const match of source.matchAll(/\bfrom="([^"]+)@\d+"/gu)) {
        const specifier = match[1]!;
        if (specifier.startsWith("@")) imported.add(specifier);
      }
      // Author/Recipe/Run child Sources use `source=`, while package imports use `from=`. Walk only
      // local files so package declarations remain data and cannot escape the project root.
      for (const match of source.matchAll(/\bsource="([^"#]+)"/gu)) {
        const child = match[1]!;
        if (child.startsWith("@") || child.startsWith("http://") || child.startsWith("https://")) continue;
        await collectSourceClosure(resolve(dirname(absolute), child));
      }
    };
    await collectSourceClosure(runPath);
    if (authorFile !== undefined) await collectSourceClosure(authorFile);
    let graphModules = new Set<string>();
    try {
      if (distributionPackageRoot !== undefined) {
        const registry = await loadStudioCompanionRegistry({ workspaceRoot: projectRoot, packageRoot: projectRoot, distributionPackageRoot });
        const domain = await loadStudioDomain({ run: runPath, workspaceRoot: projectRoot, packageRoot: projectRoot });
        const runtimePath = input.runtime === undefined ? undefined : resolve(invokedFrom(), input.runtime);
        const buildLibrary = await openStudioBuildLibrary(runtimePath, projectRoot, projectRoot, distributionPackageRoot);
        try {
          const loaded = await loadStudioRun({ run: runPath, domain, registry,
            ...(buildLibrary === undefined ? {} : { buildLibrary }) });
          graphModules = new Set([
            ...loaded.source.compiled.graph.operations.map((operation) => `${operation.producer.module.name}@${operation.producer.module.version}`),
            ...loaded.run.graph.operations.map((operation) => `${operation.producer.module.name}@${operation.producer.module.version}`),
          ]);
        } finally {
          await buildLibrary?.close();
        }
      }
    } catch {
      // The normal check reports the compiler failure; package validation still returns precise
      // structural diagnostics for every local package instead of hiding them behind one exception.
    }
    const results: Record<string, unknown>[] = [];
    for (const directory of projectPackageDirectories) {
      const manifestPath = join(directory, "package.json");
      const manifest = await readJson<{ name?: string; hypit?: { activation?: string } }>(manifestPath);
      const specifier = manifest?.name ?? basename(directory);
      const errors: string[] = [];
      if (manifest === undefined) errors.push("PACKAGE_MANIFEST_MISSING");
      else if (manifest.hypit?.activation === undefined) errors.push("PACKAGE_ACTIVATION_MISSING");
      let loaded: Awaited<ReturnType<typeof loadNodePackageSelection>> = [];
      try { loaded = await loadNodePackageSelection([specifier], projectRoot, loading); }
      catch { errors.push("PACKAGE_ACTIVATION_INVALID"); }
      const selected = loaded.find((pack) => pack.specifier === specifier || physicalPackageName(pack.specifier) === physicalPackageName(specifier));
      const contribution = selected?.contribution;
      const modules = contribution?.modules ?? [];
      const surfaces = (contribution?.hostFacets ?? []).filter((facet) => facet.abi === markupSurfaceHostFacetAbi);
      // Author packages expand Markup Surfaces into Graph Fragments; they do not need the separate
      // run-fragment host facet used by preview/mock replacement packages.
      const runFragmentFacets = (contribution?.hostFacets ?? []).filter((facet) => facet.abi === "hypit.run-fragment-host@1");
      const producers = modules.flatMap((module) => module.manifest.producers);
      const fragmentValues = runFragmentFacets.flatMap((facet) => Object.values((facet.implementation as { fragments?: Record<string, { operations?: readonly unknown[]; exports?: readonly unknown[] }> }).fragments ?? {}));
      // Author Markup Surface handlers seal Graph Fragments while decoding Source; those
      // fragments are intentionally not exposed as a package Host facet. Keep the diagnostic
      // useful for author packages by reporting their declared Surfaces as the lower bound when
      // no explicit Run Fragment facet exists.
      const fragmentCount = fragmentValues.length > 0 ? fragmentValues.length : surfaces.length;
      if (surfaces.length === 0) errors.push("PACKAGE_NO_SURFACE");
      if (producers.length === 0) errors.push("PACKAGE_NO_PRODUCER");
      if (runFragmentFacets.length > 0 && fragmentValues.every((fragment) => (fragment.operations?.length ?? 0) === 0 || (fragment.exports?.length ?? 0) === 0)) errors.push("PACKAGE_NO_FRAGMENT");
      const declaredProducers = new Set(modules.flatMap((module) => module.manifest.producers.map((producer) => `${module.manifest.name}@${module.manifest.version}#${producer.name}`)));
      for (const fragment of fragmentValues) {
        for (const operation of fragment.operations ?? []) {
          const producer = (operation as { producer?: { module?: { name?: string; version?: string }; name?: string } }).producer;
          const key = producer?.module?.name !== undefined && producer.module.version !== undefined && producer.name !== undefined
            ? `${producer.module.name}@${producer.module.version}#${producer.name}`
            : undefined;
          if (key === undefined || !declaredProducers.has(key)) errors.push("PACKAGE_FRAGMENT_PRODUCER_UNDECLARED");
        }
      }
      for (const facet of surfaces) {
        const surface = (facet.implementation as Partial<RegisteredSurface>);
        if (surface.module?.name === undefined || surface.module.version === undefined || surface.surface?.trim().length === 0
          || surface.tag?.trim().length === 0 || !Array.isArray(surface.outputs) || surface.outputs.length === 0
          || surface.outputs.some((output) => output?.module?.name === undefined || output.module.version === undefined || output.name?.trim().length === 0)) {
          errors.push("PACKAGE_SURFACE_INVALID");
        }
      }
      const sourceImported = imported.has(specifier) || [...imported].some((name) => physicalPackageName(name) === specifier);
      const graphUsed = modules.some((module) => graphModules.has(`${module.manifest.name}@${module.manifest.version}`));
      if (!sourceImported) errors.push("PACKAGE_NOT_IMPORTED");
      else if (!graphUsed) errors.push("PACKAGE_IMPORTED_BUT_UNUSED");
      results.push({ specifier, loaded_specifier: selected?.specifier, manifest: modules.length > 0, surfaces: surfaces.length, producers: producers.length, fragments: fragmentCount, run_fragment_facets: runFragmentFacets.length, source_imported: sourceImported, source_used: graphUsed, graph_used: graphUsed, status: errors.length === 0 ? "passed" : "failed", ...(errors.length === 0 ? {} : { errors }) });
    }
    for (const specifier of expected) {
      if (!results.some((item) => item.specifier === specifier)) results.push({ specifier, status: "failed", errors: ["PACKAGE_EXPECTED_BUT_MISSING"] });
    }
    const vocabularyEvidence = await stat(join(projectRoot, ".hypit", "vocabulary.json")).then(() => true, () => false);
    const passed = results.every((item) => item.status === "passed") && vocabularyEvidence;
    return {
      run: runPath,
      package_root: projectRoot,
      passed,
      vocabulary_checked: vocabularyEvidence,
      ...(vocabularyEvidence ? {} : { errors: ["VOCABULARY_NOT_CHECKED"] }),
      packages: results,
      ...(projectPackageDirectories.length === 0 && expected.size === 0 ? { note: "no project-owned packages declared" } : {}),
    };
  }
  const model = options.model ?? process.env.GEMINI_MODEL?.trim() ?? "gemini-3.1-pro";
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
    const state = await readJson<ReferenceState>(join(stateRoot(reference), "state.json"));
    assert(state !== undefined, `reference ${reference} is not prepared under ${referenceRoot()}; run prepare_reference first`);
    return state;
  };

  /**
   * What paces a round of work.
   *
   * The launch gap and the concurrency cap are a vendor's quota, so they belong to the observer that
   * sends requests and to nothing else. The observer that answers out of band reaches no Provider:
   * building a list of tasks is local and unbounded, and cutting a comparison's frames is local but
   * costs a decode, so it is paced by the machine rather than by a gap invented for someone's API.
   */
  const rateFor = (observer: Observer, work: "listing" | "ffmpeg", items: number) =>
    observer !== "agent" ? { concurrency, gapMs }
      : work === "ffmpeg" ? { concurrency: Math.max(1, Math.min(cpus().length - 1, items)), gapMs: 0 }
        : { concurrency: Number.MAX_SAFE_INTEGER, gapMs: 0 };

  // One reference is read by one observer throughout. Mixing them inside a single reference would
  // leave observations of two different kinds of evidence under the same keys, with nothing on the
  // record saying which is which, so the choice is made once at prepare and carried in the state.
  const askerFor = async (
    observer: Observer,
    state: ReferenceState,
    comparisonRun?: string,
  ): Promise<{ readonly ask: Asker; readonly pending: readonly ObservationTaskRequest[]; readonly paced?: boolean }> => {
    if (observer === "agent") {
      const pending: ObservationTaskRequest[] = [];
      // The transcript's path is fixed by the reference, so it can be named before the file exists.
      // It has to be: `prepare_reference` builds its four tasks while WhisperX is still measuring
      // beside them, and one of those four is a sound question. By the time the observer opens it,
      // that call has returned and the file is written.
      const transcriptRef = join(stateRoot(state.reference_id), "transcript.json");
      // Read once for the whole pass rather than per task. Absent during prepare, and absent for good
      // on a silent reference: a task then carries the pictures alone, which is what it had before.
      const words = await referenceWords(state.reference_id).catch(() => []);
      return {
        pending,
        // Pacing is for a quota. This asker does no I/O — it appends to an array — so holding each
        // task to the launch gap spent minutes producing a list.
        paced: false,
        ask: async (key, { media, prompt, instruction, sound, shots }) => {
          // An observation reads grids of one shot each, which is what the preamble describes. A
          // comparison holds one grid of a render and one of a stretch that may cut several times, so
          // it says how to read its own pair and the preamble would contradict it.
          const parts = key.startsWith("comparison:")
            ? [] : sound === true ? [TILE_PREAMBLE, NO_SOUND] : [TILE_PREAMBLE];
          // A word counts as inside the stretch when it overlaps it at all, so one straddling either
          // end is carried rather than dropped: it is spoken over the pictures this task holds.
          const spoken = sound !== true || shots === undefined || shots.length === 0 ? "" : words
            .filter((word) => shots.some((shot) => word.endSeconds > shot.start_seconds && word.startSeconds < shot.end_seconds))
            .map((word) => word.text).join(" ");
          pending.push({
            key, instruction, prompt: [...parts, prompt, WATERMARK_RULE].join("\n\n"), image_refs: asPictures(media, state),
            ...(sound === true && words.length > 0 ? { transcript_ref: transcriptRef } : {}),
            ...(spoken.length === 0 ? {} : { transcript_words: spoken }),
            record_with: `record_observation --reference-id ${state.reference_id} `
              + `${comparisonRun === undefined ? "" : `--run ${comparisonRun} `}`
              + `--key ${key} --text-file <the answer>`,
          });
          return observation("pending", "awaiting the agent observer");
        },
      };
    }
    const generate = await generator();
    const mediaPart = mediaParts();
    return {
      pending: [],
      ask: async (_key, { media, prompt, instruction }) => {
        const parts: GeminiInlinePart[] = [];
        for (const path of media) parts.push(await mediaPart(path));
        parts.push({ text: `${prompt}\n\n${WATERMARK_RULE}` });
        return await callSafely(retryDelayMs, generate, parts, instruction);
      },
    };
  };

  const tools: ReferenceVideoTools = {
    // Which packages exist is the first question of every reconstruction, and until now the only
    // answer was to read a guide and a directory listing by hand. The Build CLI deliberately never
    // scans a directory; this is a development tool, so it may.
    async list_svml_packages(): Promise<Record<string, unknown>> {
      // Every scope, and the project's own directory, rather than `@hypit` alone. A project that
      // declares a vocabulary gap and fills it publishes under its own scope, and a listing that
      // cannot see those packages answers "which packages exist" with only half of them — including
      // for the project asking.
      // The installed packages a project does not carry are in the Distribution, and the ones it does
      // are beside it. Reading only the root the project resolves from answers "which packages exist"
      // with whichever half that root happens to hold.
      const roots = [...new Set([join(packageRoot, "node_modules"),
        ...(videoCliDistribution.packageRoot === undefined ? [] : [join(videoCliDistribution.packageRoot, "node_modules")])])];
      const candidates: { readonly specifier: string; readonly directory: string }[] = [];
      for (const modules of roots) {
        const scopes = (await readdir(modules, { withFileTypes: true }).catch(() => []))
          .filter((entry) => entry.isDirectory() && entry.name.startsWith("@"))
          .map((entry) => entry.name);
        for (const scope of scopes.sort()) {
          const inside = await readdir(join(modules, scope)).catch(() => [] as string[]);
          for (const name of inside.sort()) {
            const specifier = `${scope}/${name}`;
            if (!candidates.some((item) => item.specifier === specifier)) {
              candidates.push({ specifier, directory: join(modules, scope, name) });
            }
          }
        }
      }
      // A project's own packages are its `packages/<name>/`, which is where they are authored and
      // where the loader finds them by name whether or not a package manager linked them.
      for (const name of (await readdir(join(packageRoot, "packages")).catch(() => [] as string[])).sort()) {
        const directory = join(packageRoot, "packages", name);
        const own = await readJson<{ readonly name?: string }>(join(directory, "package.json"));
        if (own?.name !== undefined && !candidates.some((item) => item.specifier === own.name)) {
          candidates.push({ specifier: own.name, directory });
        }
      }
      assert(candidates.length > 0, `no packages under ${roots.join(", ")} or ${join(packageRoot, "packages")}`);
      const packages: Record<string, unknown>[] = [];
      for (const { specifier, directory } of candidates) {
        const manifest = await readJson<{ readonly hypit?: { readonly activation?: string }; readonly description?: string }>(
          join(directory, "package.json"));
        if (manifest?.hypit?.activation === undefined) continue;
        // A package publishes several kinds of facet. Reading them all as one kind produced a null
        // for every facet that is not a Markup Surface, which is what an exact-model package mostly
        // publishes — the listing said `["TextVideo", "Value", null]` and a Provider said `[null]`.
        const tags: string[] = [];
        const models: string[] = [];
        let note: string | undefined;
        try {
          for (const pack of await loadNodePackageSelection([specifier], packageRoot, packageLoading())) {
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
      // A reference given as a link becomes a file before anything else runs, and everything after
      // this reads the file without learning where it came from.
      const fetched = isReferenceUrl(input.video_path)
        ? await downloadReferenceVideo(input.video_path.trim(), join(referenceRoot(), "downloads"))
        : undefined;
      const videoPath = fetched?.path ?? resolve(input.video_path);
      const file = await stat(videoPath).catch(() => undefined);
      assert(file?.isFile(), `video_path is not a file: ${videoPath}`);
      const reference = await referenceId(videoPath);
      const root = stateRoot(reference);
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
      //
      // The service is the one precondition this command can check itself. The route used to probe it
      // by hand first; it reports rather than refuses — a machine without the service still prepares
      // everything except the transcript, which stays recoverable — and points at the repair. A
      // reference whose transcript is already complete and unchanged needs no probe.
      const needsTranscript = !(state.transcript?.status === "complete" && !redoTranscript);
      const whisperx = needsTranscript ? await whisperxHealth() : undefined;
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
      // Only a complete observation is written. A pending one is a task the agent still owes, and a
      // failed one is the error that ended the attempt — written, either would be read back as an
      // answer by the next run and quoted into every shot prompt as full-reference evidence.
      const answered = <T extends Observation>(value: T): T | undefined => value.status === "complete" ? value : undefined;
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
        observations: {
          people_and_product: people,
          voices,
          persistent_systems: systems,
          places,
        },
        observer,
        ...(fetched === undefined ? {} : { source_url: fetched.url, downloaded: !fetched.cached }),
        pending_observations: pending,
        ...(whisperx?.ok === false
          ? { whisperx: `${whisperx.reason}. Read <skill-root>/references/host-setup.md for the failure branches.` }
          : {}),
      };
    },

    async observe_reference(input): Promise<Record<string, unknown>> {
      if (input.questions !== undefined) {
        const round = input.questions;
        assert(round.length > 0, "questions is empty");
        const rate = rateFor((await loadState(input.reference_id)).observer ?? "gemini", "listing", round.length);
        const { done, failures } = await runBatch(round, rate, async (asked) => await tools.observe_reference({
          reference_id: input.reference_id, shot_ids: asked.shot_ids, question: asked.question,
        }));
        return {
          reference_id: input.reference_id,
          asked: done.length,
          failed: failures.length,
          answers: done,
          ...(failures.length === 0 ? {} : { failures }),
          // The one thing gathered across the whole round: an observer that answers out of band owes
          // one task per question, and they are answered together rather than call by call.
          pending_observations: done.flatMap((item) => (item["pending_observations"] ?? []) as readonly unknown[]),
        };
      }
      const state = await loadState(input.reference_id);
      const selected = input.shot_ids === undefined ? state.shots : state.shots.filter((shot) => input.shot_ids!.includes(shot.shot_id));
      assert(selected.length > 0, "no requested shot ids exist");
      const observer: Observer = state.observer ?? "gemini";
      const { ask, pending, paced } = await askerFor(observer, state);
      // An observer that answers out of band produces a list rather than a request, so the launch gap
      // and the concurrency cap have nothing to pace.
      const rate = paced === false ? { concurrency: Number.MAX_SAFE_INTEGER, gapMs: 0 } : { concurrency, gapMs };
      const question = input.question?.trim() ?? "";
      if (question.length > 0) {
        assert(input.shot_ids !== undefined && input.shot_ids.length > 0, "question requires at least one shot id, so that it is answered from the shots it is about");
        assert(selected.length === 1, "question accepts exactly one shot id; use the built-in boundary/window observations for cross-shot continuity");
        // Keep the actual question in the key. It remains directly inspectable and distinguishes two
        // questions over the same shot without inventing a second identifier namespace.
        const key = `question:${selected.map((shot) => shot.shot_id).join("+")}:${encodeURIComponent(question)}`;
        const path = join(state.root, "observations.json");
        const held = (await readJson<Record<string, Observation>>(path))?.[key];
        const reused = held?.status === "complete" && input.reobserve !== true;
        // Through the same cache the sweep uses, rather than straight to the asker. Asked directly, an
        // answer recorded against this key was written to a file nothing read: the observer that
        // answers out of band could never retrieve one, and the observer that bills was asked again.
        const answers = await runObservationTasks(
          state.root,
          [{ key, request: {
            media: selected.flatMap((shot) => [shot.clip_ref, shot.representative_frame_ref]),
            // A narrow question is as likely to be about who is speaking as about what is on screen, and
            // this is the one prompt where the observer reading pictures was not told it cannot hear.
            sound: true,
            shots: selected,
            prompt: question,
            instruction: "Answer only the narrow reference-video question in natural language. Do not write code, markup, SVML, or component names.",
          } }],
          input.reobserve === true ? new Set([key]) : new Set<string>(),
          rate.concurrency, rate.gapMs, ask,
        );
        const answer = answers.get(key)!;
        return {
          reference_id: state.reference_id,
          observer,
          shot_ids: selected.map((shot) => shot.shot_id),
          question,
          observation_key: key,
          result: answer,
          // Says the answer came back without asking anyone, so a reader knows they were not billed
          // for it and that `--reobserve` is what asks again.
          ...(reused ? { reused: true } : {}),
          unresolved: answer.status === "complete" ? [] : [key],
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
      // Only a complete observation is evidence. A failed one carries the error that ended it, and
      // read by `.text` alone that string was quoted into every shot prompt underneath a heading
      // announcing it as full-reference evidence.
      const evidence = (value: Observation | undefined, heading: string): string =>
        value?.status === "complete" && value.text.trim().length > 0 ? `${heading}:\n${value.text}` : "";
      const globalContext = [
        evidence(state.people_and_product, "Full-reference people and product evidence"),
        evidence(state.voices, "Full-reference voice evidence"),
        evidence(state.persistent_systems, "Full-reference persistent on-screen system evidence"),
        // The sweep already refuses to start until this is complete, so leaving it out of the context
        // it was waited for made the wait buy nothing.
        evidence(state.places, "Full-reference places and camera-position evidence"),
      ].filter((item) => item.length > 0).join("\n\n");
      const visualTasks: ObservationTask[] = selected.map((shot) => {
        const previous = state.shots.find((candidate) => candidate.index === shot.index - 1);
        return { key: `visual:${shot.shot_id}`, request: {
          media: [shot.clip_ref, shot.representative_frame_ref, ...(previous === undefined ? [] : [previous.tail_frame_ref])],
          prompt: `${globalContext}\n\nObserve shot ${shot.index}. Describe the current base picture, any covering or non-covering visual content, and whether visible content continues from the preceding shot. A full-screen insert is still only a picture observation. Covering content is whatever changes what reaches the eye, not only things that sit on top with an edge: a wash, darkening, gradient or semi-transparent layer laid over the whole frame or a region of it is covering content and must be reported as such, including what the base shows through it.\n\nAlso answer these two questions explicitly.\n\nFirst: is the whole frame a depicted scene that has its own camera space, lighting, depth and lens behaviour, or is it a flat designed field whose purpose is to carry drawn elements such as words, rows, panels or cards? Live action and animation are both depicted scenes; a paper sheet, ruled or gridded surface, flat or gradient colour, blurred wallpaper, board or slide backdrop filling the frame is a designed field. State which one it is and the visible evidence for it.\n\nThen, whichever it is, say whether any *region* of the frame is itself a flat designed field carrying drawn content — a list, a ranking, a leaderboard, a scoreboard, a chart, a panel, a slab of colour holding rows or labels — even when the rest of the frame is a depicted scene, and even when the region has no visible border, card edge or drop shadow around it. Report each such region separately from the scene behind it: roughly where it sits and how much of the frame it covers, given as fractions of the frame width and height; what its own surface is; and what is drawn on it. A designed field occupying half the frame, one side of it, or a band across it is easy to describe as "text over the picture" and is not that: the field itself is the thing to report.\n\nSecond: for every framed element inside the picture, such as a card, phone, browser window, screenshot or inset, describe the picture inside the frame and the frame itself separately, and say separately whether each one moves. For the inside, describe what it depicts and whether its content moves — scrolling, paging, playing, changing. For the frame, describe its border, corner radius, outline, shadow, size and position, whether that rectangle stays in the same place and at the same size across the whole shot or travels, and how it enters and leaves. These two are independent and are routinely confused: a screen recording of a page being scrolled is a frame that does not move at all while its contents travel inside it. Decide it from the frame's own edge — track the border and corners across the stretch and say whether that rectangle held still.\n\nThird: does this picture move at all, and how? Separate three things: whether the camera moves, and how; whether anything in the picture moves, and what; and whether the picture is completely still. A held photograph, screenshot or card that only appears and disappears is still, however long it is on screen. Where the only movement is inside a framed element, say so in those words rather than reporting the picture as moving.\n\nReturn natural language evidence only.`,
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
          shots: [shot],
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
          shots: [left, right],
          prompt: `Compare shots ${left.index} and ${right.index}, which meet at one cut. Answer two questions separately, each under its own heading.\n\nContinuous camera shot: are these one continuous camera shot, or two? Explain the visual and sound continuity evidence.\n\nOverlay continuity: does the same visible overlay or inserted picture continue across the boundary, change, or end? Explain the evidence.\n\nReturn natural language evidence only.`,
          instruction: "Analyze what happens at one cut. Do not name SVML components or write code.",
        } };
      });
      const allTasks = [...visualTasks, ...typeTasks, ...audioTasks, ...boundaryTasks];
      const reobserve = input.reobserve === true;
      const forcedKeys = reobserve ? new Set(allTasks.map((task) => task.key)) : new Set<string>();
      const observations = await runObservationTasks(state.root, allTasks, forcedKeys, rate.concurrency, rate.gapMs, ask);
      const unresolved = [...observations].filter(([, value]) => value.status !== "complete").map(([key]) => key);
      // Only an answered boundary decides this. An unanswered one carries a placeholder or an error,
      // and reading those as prose put the review on whether the failure text happened to contain one
      // of the words below.
      const answeredBoundaries = boundaryRights
        .map((right) => observations.get(`boundary:${right.shot_id}`))
        .filter((value) => value?.status === "complete");
      const boundaryText = answeredBoundaries.map((value) => value!.text).join("\n");
      // A boundary nobody answered has not said the shots are separate. Deciding the three-shot review
      // from the answered ones alone would let a sweep whose boundaries all failed report no review
      // needed, which reads the same as a reference with no continuity to check.
      const undecidedBoundaries = boundaryRights.length - answeredBoundaries.length;
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
          // Continuity across a cut is heard as much as seen, which is why the two-shot boundary asks
          // with sound. This asks the same question over three shots, so an observer reading pictures
          // is told the same thing about what it is missing.
          sound: true,
          shots: items,
          prompt: `Compare shots ${items[0].index}, ${items[1].index}, and ${items[2].index}. Decide whether the three clips are one continuous camera shot and whether one visual overlay or insert persists through both boundaries. Explain the evidence in natural language only.`,
          instruction: "Analyze a three-shot continuity window only. Do not write markup, SVML, JSON plans, or component names.",
        },
      }));
      const windowObservations = await runObservationTasks(
        state.root, windowTasks,
        reobserve ? new Set(windowTasks.map((task) => task.key)) : new Set<string>(),
        rate.concurrency, rate.gapMs, ask,
      );
      const threeShotObservations = windows.map((items) => ({
        shot_ids: items.map((shot) => shot.shot_id),
        combined_duration_seconds: Number((items[2].end_seconds - items[0].start_seconds).toFixed(3)),
        result: windowObservations.get(`window:${items[0].shot_id}`)!,
      }));
      for (const window of threeShotObservations) {
        if (window.result.status !== "complete") unresolved.push(`three-shot:${window.shot_ids.join("+")}`);
      }
      // The review is decided from what the boundaries said, so boundaries nobody has answered leave it
      // undecided rather than unnecessary. Producing no window task and reporting nothing is how a
      // sweep that answered its boundaries out of band and stopped after one pass ends up with a
      // continuity review that was never run and never missed.
      if (selected.length >= 3 && undecidedBoundaries > 0 && !needsThreeShotReview) {
        unresolved.push(`three-shot-review-undecided:${undecidedBoundaries} boundar`
          + `${undecidedBoundaries === 1 ? "y is" : "ies are"} unanswered, so whether a three-shot continuity `
          + "review is needed has not been decided; answer them and run observe_reference again");
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
      const loaded = await loadNodePackageSelection(input.package_names, packageRoot, packageLoading());
      const requested = input.tags === undefined ? undefined : new Set(input.tags);
      // The answer is about the packages that were named. Loading one brings its dependencies with
      // it, and every one of their Surfaces used to be returned as well — asking what `@hypit/ranking`
      // offers answered with twenty Surfaces of which six were its own, sixty-four kilobytes for a
      // question about six. The rest are reachable by naming them, which is what `list_svml_packages`
      // is for.
      const named = new Set(input.package_names);
      const surfaces: Record<string, unknown>[] = [];
      for (const pack of loaded) {
        if (!named.has(pack.specifier)) continue;
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
            readme_path: readmePath(pack.specifier, packageRoot, packageLoading()),
          });
        }
      }
      const result = { packages: input.package_names, surfaces };
      return result;
    },

    async validate_local_author_packages(input): Promise<Record<string, unknown>> {
      return await validateLocalAuthorPackages(input);
    },

    async validate_script_cues(input): Promise<Record<string, unknown>> {
      return await scriptCueCheck(input);
    },

    /**
     * What a Producer that draws is allowed to return.
     *
     * `inspect_svml_vocabulary` answers what a Source may write; this answers what the package behind
     * it may emit — the element kinds, the style names admitted on them, which of those take an enum,
     * and how few keyframes an animation may carry. Every line is generated from `composition`'s own
     * declared schema, so it cannot drift from what the seal will accept. Without it the only way to
     * learn the shape was to open a package that already draws and copy its habits.
     */
    async inspect_visual_schema(input): Promise<Record<string, unknown>> {
      const shapes: Record<string, ValueSchema> = {
        "visual-track": visualTrackSchema,
        "visual-element": visualElementSchema,
        box: visualBoxSchema,
        mask: visualMaskSchema,
        text: visualTextSchema,
        image: visualImageSchema,
        video: visualVideoSchema,
        surface: visualSurfaceSchema,
        "text-flow": visualTextFlowSchema,
        "text-typography": visualTextTypographySchema,
        "text-paint": visualTextPaintSchema,
        "text-document": visualTextDocumentSchema,
        "path-command": visualPathCommandSchema,
      };
      const asked = input.shape?.trim();
      assert(asked === undefined || asked.length === 0 || Object.hasOwn(shapes, asked),
        `shape must be one of ${Object.keys(shapes).join(", ")}`);
      const chosen = asked === undefined || asked.length === 0 ? Object.keys(shapes) : [asked];
      // Which Producers a Fragment may call, read off the Modules the named packages carry. A
      // component's Fragment names one per operation, and the names were reachable only by opening a
      // package that already called them.
      const wanted = input.producers ?? [];
      const calls = wanted.length === 0 ? [] : (await loadNodePackageSelection(wanted, packageRoot, packageLoading()).catch(() => []))
        .flatMap((pack) => (pack.contribution.modules ?? []).flatMap((module) =>
          module.manifest.producers.map((producer) => ({
            module: `${module.manifest.name}@${module.manifest.version}`,
            producer: producer.name,
            inputs: producer.inputs.map((port) => port.name),
            outputs: producer.outputs.map((port) => port.name),
            ...(producer.needs.length === 0 ? {} : { needs: producer.needs.map((port) => port.name) }),
          }))));
      return {
        shapes: chosen.map((name) => ({ shape: name, describes: describeSchema(shapes[name]!).join("\n") })),
        animatable_local_styles: [...animatableLocalStyles],
        visual_style_names: [...VISUAL_STYLE_NAMES_V1],
        visual_style_enum_values: VISUAL_STYLE_ENUM_VALUES_V1,
        ...(calls.length === 0 ? {} : { producers: calls }),
        // Each of these is refused somewhere, or follows from how the emitted CSS is written. None is
        // a convention: a rule stated here that the code does not hold would be worse than silence.
        rules: [
          "A Present holds exactly one element with no `parent`; every other element names one, and it "
            + "must be a box or a mask. (composition/src/track.ts)",
          "`order` is unique across the whole Present, not among siblings. (composition/src/track.ts)",
          "A child's position is measured from its parent's box, not from the Canvas, so a layout "
            + "computed in Canvas pixels subtracts the parent's origin.",
          "An animation carries at least two keyframes, and every keyframe of one animation declares "
            + "the same properties: one that appears in some and not others is interpolated from the "
            + "element's own value on the frames it is missing from. `atFrame` is Present-relative; the "
            + "document normalizes the animation domain to `max(presentDurationFrames, lastKeyframe.atFrame)`.",
          "A plain text element must provide exact ordered font artifacts and cannot combine them with "
            + "raw `font`, `font-family`, `font-style`, `font-synthesis` or `font-weight` styles.",
          "A text element using glyph Paint cannot also declare raw stroke or paint-order styles.",
          "A media element's artifact media type must match image/video, and still images cannot carry sampling.",
          "A Surface with still timing cannot carry sampling; frame-based Surface sampling must match its typed timing.",
          "Mask roots must be direct children of one Present and both mask/content references must resolve to owned elements.",
        ],
      };
    },

    /** Where this command reads and resolves from, so nothing has to describe it from outside. */
    async paths(): Promise<Record<string, unknown>> {
      return {
        reference_state: referenceRoot(),
        package_root: packageRoot,
        working_directory: invokedFrom(),
        references: (await readdir(referenceRoot(), { withFileTypes: true }).catch(() => []))
          .filter((entry) => entry.isDirectory()).map((entry) => entry.name),
      };
    },

    async compare_reconstruction(input): Promise<Record<string, unknown>> {
      // Every render is finished before any comparison starts, so the comparisons are independent of
      // each other and there is nothing to gain by running them one at a time. Handing the whole list
      // over means the pacing, the per-comparison result and the failure of any one of them are the
      // tool's business rather than a shell script's.
      if (input.comparisons !== undefined) {
        const batch = input.comparisons;
        assert(batch.length > 0, "comparisons is empty");
        // Each entry cuts and tiles its own two sides, so on the observer that answers out of band
        // this round is ffmpeg work rather than a queue of requests.
        const rate = rateFor((await loadState(input.reference_id)).observer ?? "gemini", "ffmpeg", batch.length);
        const { done, failures } = await runBatch(batch, rate,
          async (one) => await tools.compare_reconstruction({ reference_id: input.reference_id, ...one }));
        return {
          reference_id: input.reference_id,
          compared: done.length,
          failed: failures.length,
          comparisons: done,
          ...(failures.length === 0 ? {} : { failures }),
        };
      }
      const state = await loadState(input.reference_id);
      const root = stateRoot(state.reference_id);
      const named = [input.shot_id, input.segment, input.selection, input.tokens].filter((value) => value !== undefined);
      assert(named.length === 1, "name exactly one of shot_id, segment, selection and tokens");
      if (input.tokens !== undefined) tokenWindow(input.tokens, "tokens");
      const supplied = [input.image_path, input.video_path].filter((value) => value !== undefined);
      assert(supplied.length === 1, "supply exactly one of image_path and video_path");
      const clip = input.video_path !== undefined;
      const renderedPath = resolve(String(supplied[0]));
      const file = await stat(renderedPath).catch(() => undefined);
      assert(file?.isFile(), `${clip ? "video_path" : "image_path"} is not a file: ${renderedPath}`);
      const scope = input.question?.trim() ?? "";
      const startedAt = new Date().toISOString();
      // Each explicit comparison gets its own readable directory. Repeating the command is a new
      // observation by request; no hidden equivalence rule silently reuses an older answer.
      const slot = eventId(basename(renderedPath).replace(/\.[^.]*$/u, ""), new Date(startedAt));
      const standIn = await standInBeside(renderedPath);
      const observer: Observer = state.observer ?? "gemini";
      const { ask, pending } = await askerFor(observer, state, input.run);

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
          "run is required with a word range: the words are read from the Run's Author SVML");
        const { path: svmlPath } = await authorSource(resolve(invokedFrom(), input.run));
        const focus: StandInFocus = {
          ...(input.segment === undefined ? {} : { segment: input.segment }),
          ...(input.selection === undefined ? {} : { selection: input.selection }),
          ...(input.tokens === undefined ? {} : { tokens: input.tokens }),
        };
        const range = await spokenRange(svmlPath, focus, await referenceWords(state.reference_id));
        cut = await cutWordRange(state, root, focus, range, renderedPath, clip, slot);
        referenceMedia = cut.reference;
        renderedMedia = cut.rendered;
        stretchSeconds = cut.seconds;
      }

      // A stretch that holds one picture on both sides has one picture to compare, and a clip or a
      // grid of the same frame repeated says nothing the frame alone does not.
      //
      // Both sides are measured, and both have to be still. The render's base is a flat preview mock
      // and is therefore still whatever it covers, so a render measured on its own would carry every
      // pair down to a frame — including the pairs whose reference moves, where the difference
      // between a mock base and a real one would be doing the deciding.
      let bothStill = false;
      if (clip) {
        bothStill = await completelyStill(referenceMedia) && await completelyStill(renderedMedia);
        if (bothStill) {
          referenceMedia = shot === undefined
            ? await cutFrame(cut!.reference, stretchSeconds / 2, cut!.referenceStill)
            : shot.representative_frame_ref;
          let stillTarget = cut?.renderedStill ?? "";
          if (shot !== undefined) {
            stillTarget = join(root, "comparisons", `shot-${shot.shot_id}`, slot, "reconstruction-still.jpg");
            await ensureDir(dirname(stillTarget));
          }
          renderedMedia = await cutFrame(renderedMedia, stretchSeconds / 2, stillTarget);
        }
      }
      const asClip = clip && !bothStill;

      // Reference and rendered clips may legitimately have different durations (for example, spoken
      // delivery and generated-video timing). The observer compares each side over its own stretch;
      // duration differences are evidence to report, not a precondition that blocks the comparison.

      // A clip comparison reads the whole stretch on both sides. The observer that reads video is
      // given the two clips; the observer that reads pictures is given two frame tiles, which is the
      // same degradation `prepare_reference` already applies to a shot. Tiling both against the same
      // duration makes `tileFrames` choose the same frame count and layout for each, so the two grids
      // are read side by side rather than as different samplings.
      //
      // Both grids are drawn at one cell width, and it is the width the reference itself has. Left at
      // a fixed 480 the two sides were degraded in opposite directions — a 360-wide reference enlarged
      // and a 1080-wide render shrunk — and the prompt asks about stroke weight and letter spacing,
      // which is exactly what that changes.
      const cellWidth = Math.min(480, state.video.width);
      if (asClip && observer === "agent") {
        const desiredFrames = tileFrames(stretchSeconds);
        if (shot !== undefined) {
          assert(shot.frames_tile_ref !== null,
            `shot ${shot.shot_id} has no frame tile; re-prepare the reference with --redo all --observer agent`);
          referenceMedia = shot.frames_tile_ref;
          const tileTarget = join(root, "comparisons", `shot-${shot.shot_id}`, slot, "reconstruction.jpg");
          await ensureDir(dirname(tileTarget));
          const renderedDuration = (await probe(renderedPath)).duration;
          renderedMedia = await shotTile(renderedPath, renderedDuration, tileTarget, cellWidth, desiredFrames);
        } else {
          // A word range is cut when it is asked for, so neither side has a prepared tile and both
          // are built here, from the two cuts.
          referenceMedia = await shotTile(cut!.reference, cut!.referenceSeconds, cut!.referenceTile, cellWidth, desiredFrames);
          renderedMedia = await shotTile(cut!.rendered, cut!.renderedSeconds, cut!.renderedTile, cellWidth, desiredFrames);
        }
      }

      // What the observer is actually holding. A grid is neither a clip nor a single moment, and
      // calling it a still image while asking what changes over the stretch described two different
      // things to the same reader.
      const grids = asClip && observer === "agent";
      const unit = grids ? "frame grids" : asClip ? "video clips" : "still images";
      const reading = grids
        ? "\n\nEach is a grid of frames sampled evenly across the same stretch, laid out in reading"
          + " order: left to right, then top to bottom. Read each grid as time passing, and compare the"
          + " two as sequences rather than as single moments. Neither grid is one continuous camera"
          + " shot; a stretch may contain cuts."
        : "";
      const comparisonId = slot;
      const comparisonEvidence = comparisonLogForRun(input.run, root);
      const differences = await ask(`comparison:${comparisonId}`, {
        media: [referenceMedia, renderedMedia],
        instruction: `You compare two supplied ${unit} and describe their visible differences in natural language only. You are not told how either was made. Do not write code, markup, SVML, component names, or production advice.`,
        prompt: `Two ${unit} are supplied in order: one, then two. Call them one and two throughout your answer, and say which of the two each difference is in.${reading}${asClip ? "\n\nThe two clips may have different total durations or playback speeds. Compare corresponding visual stages and events rather than matching the same elapsed second, and do not treat a duration difference alone as a visual defect." : ""}${asClip ? cut?.incomplete ?? "" : ""}${scope.length === 0 ? "" : `\n\nLimit the comparison to this: ${scope}`}\n\nStart with a geometry pass before style: identify the Canvas, the outer frame or background box, and the inner text/element. For every region intended to be vertically centred, compare inner and outer centres on the Y axis and report whether it is too high or too low. Do not treat deliberate left/right bias as a defect. Check containment separately (inner content inside its outer frame; outer frame inside the Canvas), naming the overflowing edge and approximate amount. Check that the outer frame is wide and tall enough for the longest line or mark including padding, stroke, shadow and corner treatment. Treat overlap candidates as prompts for inspection only: the supplied reference or settled brief and intent decide whether an overlap or offset is correct; never recommend removing an intentional overlap merely because it exists. Distinguish intentional bleed, crop, or enter/exit motion from accidental overflow. Then describe every other visible difference between them: layout and arrangement, the position and size of each element, cropping and margins, colour, typeface, weight, letter and line spacing, alignment, outline or stroke, shadow, glow, borders and corner treatment, and anything present in one and absent from the other.${asClip ? " Also describe differences in what changes over the stretch: what appears, what leaves, in what order, and how anything moves." : ""} State plainly which differences are large enough to read as a different design and which are minor. If they are visually equivalent, say exactly that.\n\nDo not speculate about how either was produced, which one is a source, or which one is a copy. Return natural language only.`,
      });
      // What was compared, and what was seen. The record is useful content, not a workflow cursor.
      await appendLooked(comparisonEvidence, {
        at: startedAt,
        id: comparisonId,
        ...(input.run === undefined ? {} : { run: resolve(invokedFrom(), input.run) }),
        ...(shot === undefined ? {} : { shot_id: shot.shot_id }),
        ...(cut === undefined ? {} : { range: cut.record }),
        ...(input.element === undefined ? {} : { element: input.element.trim() }),
        image_path: renderedPath,
        observer,
        status: differences.status,
        scoped: scope.length > 0,
        ...(scope.length === 0 ? {} : { scope }),
        clip: asClip,
        ...(standIn === undefined ? {} : { stand_in: standIn }),
        ...(differences.status === "complete" ? { differences: differences.text } : {}),
      });
      return {
        reference_id: state.reference_id,
        observer,
        ...(shot === undefined ? {} : { shot_id: shot.shot_id }),
        ...(cut === undefined ? {} : {
          range: cut.record,
          ...(clip ? { reference_seconds: cut.referenceSeconds, rendered_seconds: cut.renderedSeconds } : {}),
          ...(asClip && cut.incomplete.length > 0 ? { incomplete_ends: cut.incomplete.trim() } : {}),
        }),
        comparison_id: comparisonId,
        compared: asClip ? "clip" : "still",
        ...(bothStill ? { both_sides_still: true } : {}),
        reference_ref: referenceMedia,
        rendered_ref: renderedMedia,
        ...(standIn === undefined ? {} : { stand_in: standIn }),
        differences,
        unresolved: differences.status === "complete" ? [] : [`comparison:${comparisonId}`],
        ...(differences.status === "pending" ? {
          record_with: `record_observation --reference-id ${state.reference_id} `
            + `--key comparison:${comparisonId} --text-file <the differences>`,
        } : {}),
        pending_observations: pending,
      };
    },

    // The `agent` observer answers in its own context, so the answer comes back through here rather
    // than through a return value. The four whole-reference observations live in the state and the
    // rest in the observation cache, which is where each one was already read from.
    async record_observation(input): Promise<Record<string, unknown>> {
      if (input.answers !== undefined) {
        const round = input.answers;
        assert(round.length > 0, "answers is empty");
        // Read once, before the round, so a reference that records its own answers refuses the call
        // rather than every entry in it.
        const reading = await loadState(input.reference_id);
        assert(reading.observer === "agent", `reference ${input.reference_id} is read by the ${reading.observer ?? "gemini"} observer, which records its own answers`);
        // One at a time. Every answer is a read-modify-write of one file, and `serially` below already
        // holds them apart, so a round could run at once and be correct — it would only be a queue at
        // a lock, for writes that take no time. Running them in the order they were written keeps the
        // failures in that order too.
        const { done, failures } = await runBatch(round, { concurrency: 1, gapMs: 0 }, async (one) =>
          await tools.record_observation({ reference_id: input.reference_id, ...(input.run === undefined ? {} : { run: input.run }), key: one.key, text: one.text }));
        return {
          recorded: done.length,
          failed: failures.length,
          records: done,
          ...(failures.length === 0 ? {} : { failures }),
        };
      }
      const state = await loadState(input.reference_id);
      assert(state.observer === "agent", `reference ${input.reference_id} is read by the ${state.observer ?? "gemini"} observer, which records its own answers`);
      assert(input.key !== undefined, "key is required");
      assert(input.text !== undefined, "text is required");
      const key = input.key.trim();
      assert(key.length > 0, "key is required");
      const text = input.text.trim();
      assert(text.length > 0, "text is required; an observation that saw nothing says so in words");
      const root = stateRoot(input.reference_id);
      if (WHOLE_REFERENCE_KEYS.includes(key as typeof WHOLE_REFERENCE_KEYS[number])) {
        const field = key as typeof WHOLE_REFERENCE_KEYS[number];
        await serially(root, async () => {
          const current = await readJson<ReferenceState>(join(root, "state.json")) ?? state;
          await writeJson(join(root, "state.json"), { ...current, [field]: observation("complete", text) });
        });
        return { reference_id: state.reference_id, key, stored_in: "state" };
      }
      // A comparison is answered against the entry it opened in the log rather than against the
      // observation cache: the log is what a report reads to tell an element that was looked at from one
      // that never was, and until this existed an agent-observer comparison could never leave `pending`.
      if (key.startsWith("comparison:")) {
        const comparisonId = key.slice("comparison:".length);
        const comparisonEvidence = comparisonLogForRun(input.run, root);
        const closed = await closeLooked(comparisonEvidence, comparisonId, text);
        assert(closed, `${key} names no open comparison of reference ${input.reference_id}`);
        return { reference_id: state.reference_id, key, stored_in: "comparisons" };
      }
      const shotKeys = new Set(state.shots.flatMap((shot) => [`visual:${shot.shot_id}`, `type:${shot.shot_id}`, `audio:${shot.shot_id}`, `boundary:${shot.shot_id}`, `window:${shot.shot_id}`]));
      // Narrow questions carry the encoded question itself after the shot id. That is longer than an
      // opaque token, but it is inspectable and requires no side table.
      const questionKey = /^question:([0-9a-z-]+(?:\+[0-9a-z-]+)*):(.+)$/u.exec(key);
      const knownShots = new Set(state.shots.map((shot) => shot.shot_id));
      const askedOver = questionKey?.[1]!.split("+") ?? [];
      let validEncodedQuestion = false;
      if (questionKey !== null) {
        try { validEncodedQuestion = decodeURIComponent(questionKey[2]!).trim().length > 0; }
        catch { validEncodedQuestion = false; }
      }
      const isQuestion = questionKey !== null && validEncodedQuestion && askedOver.length === 1 && askedOver.every((id) => knownShots.has(id));
      assert(shotKeys.has(key) || isQuestion, `key ${key} is not an observation of reference ${input.reference_id}`);
      // A round of answers arrives as a round of calls, and each one is a read-modify-write of this
      // file. Two of them reading before either writes is how an answer disappears with no error.
      await serially(root, async () => {
        const path = join(root, "observations.json");
        const cache = await readJson<Record<string, Observation>>(path) ?? {};
        cache[key] = observation("complete", text);
        await writeJson(path, cache);
      });
      return { reference_id: state.reference_id, key, stored_in: "observations" };
    },

    async review_element(input): Promise<Record<string, unknown>> {
      const runPath = resolve(invokedFrom(), input.run);
      const root = dirname(reviewLogPath(runPath));
      await ensureDir(root);

      if (input.reviews !== undefined) {
        const batch = input.reviews;
        assert(batch.length > 0, "reviews is empty");
        // Local work throughout — a decode per entry and no request anywhere — so it is paced by the
        // machine, the way `render_element` is.
        const { done, failures } = await runBatch(batch, locallyPaced(batch.length),
          async (one) => await tools.review_element({ ...one, run: input.run }));
        return {
          run: runPath,
          reviewed: done.length,
          failed: failures.length,
          reviews: done,
          ...(failures.length === 0 ? {} : { failures }),
        };
      }

      const element = input.element?.trim() ?? "";
      assert(element.length > 0, "--element is required; a review with no element is credited to nothing");
      const named = [input.segment, input.selection, input.tokens].filter((value) => value !== undefined);
      assert(named.length === 1, "name exactly one of --segment, --selection or --tokens: the window the render covers");
      if (input.tokens !== undefined) tokenWindow(input.tokens, "tokens");
      const supplied = [input.image_path, input.video_path].filter((value) => value !== undefined);
      assert(supplied.length === 1, "supply exactly one of --image or --video");

      const intent = (input.intent ?? (input.intent_file === undefined
        ? undefined
        : await readFile(resolve(invokedFrom(), input.intent_file), "utf8")))?.trim() ?? "";
      assert(intent.length > 0,
        "--intent-file is required: what this element was asked to be, in the words the brief was taken in. "
        + "Without it the question is whether the picture looks acceptable, which it always does to whoever drew it.");

      const renderedPath = resolve(invokedFrom(), input.video_path ?? input.image_path!);
      await stat(renderedPath).catch(() => { throw new Error(`cannot read ${renderedPath}`); });
      const slot = eventId(basename(renderedPath).replace(/\.[^.]+$/u, ""));
      const standIn = await standInBeside(renderedPath);
      const scope = input.question?.trim() ?? "";
      const startedAt = new Date().toISOString();

      // The reader looks at pictures, so a clip becomes a grid of its own frames. With no reference
      // beside it there is no second side to match, so the render's own duration and width decide the
      // sampling — and its own stillness decides whether there is anything to sample at all.
      let picture = renderedPath;
      let asClip = false;
      if (input.video_path !== undefined) {
        const drawn = await probe(renderedPath);
        asClip = !(await completelyStill(renderedPath));
        const target = join(root, "reviews", slot, asClip ? "element.jpg" : "element-still.jpg");
        await ensureDir(dirname(target));
        picture = asClip
          ? await shotTile(renderedPath, drawn.duration, target, Math.min(480, drawn.width))
          : await cutFrame(renderedPath, drawn.duration / 2, target);
      }

      const range = {
        ...(input.segment === undefined ? {} : { segment: input.segment }),
        ...(input.selection === undefined ? {} : { selection: input.selection }),
        ...(input.tokens === undefined ? {} : { tokens: input.tokens }),
      };
      const reviewId = slot;
      const unit = asClip ? "grid of frames sampled evenly across the stretch, laid out in reading order: left to right, then top to bottom" : "still picture";
      const record: ReviewRecord = {
        at: startedAt, id: reviewId, element,
        range,
        image_path: renderedPath, status: "pending",
        ...(scope.length === 0 ? {} : { scope }), clip: asClip,
        ...(standIn === undefined ? {} : { stand_in: standIn }),
        intent,
      };
      await appendLooked(reviewLog(root), record);

      return {
        run: runPath, element,
        ...(input.segment === undefined ? {} : { segment: input.segment }),
        ...(input.selection === undefined ? {} : { selection: input.selection }),
        review_id: reviewId,
        reviewed: asClip ? "clip" : "still",
        ...(standIn === undefined ? {} : { stand_in: standIn }),
        pending_reviews: [{
          key: `review:${reviewId}`,
          instruction: "You are given one picture of a rendered video element and a written description of what it"
            + " was asked to be. Report whether the picture matches the description, and every visible defect."
            + " You are not told how it was produced. Do not write code, markup, SVML, component names, or"
            + " production advice.",
          prompt: `The picture is one ${unit}.\n\n`
            + `What this element was asked to be:\n\n${intent}\n\n`
            + (scope.length === 0 ? "" : `Read only this part of the picture: ${scope}\n\n`)
            // Said by the tool rather than left to be retyped each round: on this route nobody is
            // billed to look and the mocks are not the author's business, so there is no reason to
            // make it something a caller can forget.
            + "Flat-filled regions stand in for pictures that have not been generated yet. Ignore what they"
            + " contain and read only what is drawn over them.\n\n"
            + "Answer two things, each under its own heading.\n\n"
            + "Matches the description: state which parts of the description the picture satisfies and which"
            + " it does not. Name anything the description asks for that is not there, and anything present"
            + " that the description does not mention.\n\n"
            + "Visible defects: begin with a geometry pass. Identify Canvas, outer frame/background, and"
            + " inner text/element. For centred regions report the inner-to-outer centre offset and direction."
            + " Check inner-content containment inside the outer frame, outer-frame containment inside the"
            + " Canvas, and whether the frame has enough width/height for the longest content plus padding,"
            + " stroke, shadow and corner treatment. Report each overflowing edge and approximate amount;"
            + " distinguish intentional bleed/crop or enter/exit motion from accidental overflow. Then report"
            + " each other defect you can see, and say it is absent when you cannot: anything cut off by the"
            + " edge of the frame or reaching past it; anything overlapping or covering something else that"
            + " is meant to be read; anything whose position or alignment against the edges of the frame"
            + " looks unintended; and text or marks too low in contrast against what is behind them to read."
            + (asClip ? " Anything that appears, moves or leaves in a way the description does not account for." : "")
            + "\n\nMeasure what you can against the frame's own width and height rather than in pixels."
            + " Return natural language only.",
          image_refs: [picture],
        }],
        record_with: `record_review --run ${runPath} --review-id ${reviewId} --text-file <the findings>`,
        unresolved: [`review:${reviewId}`],
      };
    },

    // The findings come back out of band, the way an observation's do: whoever looked at the picture
    // did it somewhere else and returns text. This is where that text lands, and until it does the
    // review has been drawn and handed over with nobody having said what it shows.
    async record_review(input): Promise<Record<string, unknown>> {
      const runPath = resolve(invokedFrom(), input.run);
      const root = dirname(reviewLogPath(runPath));
      const id = input.review_id.trim().replace(/^review:/u, "");
      assert(id.length > 0, "review_id is required");
      const text = input.text.trim();
      assert(text.length > 0, "text is required; a review that found nothing wrong says so in words");
      const closed = await closeLooked(reviewLog(root), id, text);
      assert(closed, `${id} names no open review of ${runPath}`);
      return { run: runPath, review_id: id, stored_in: reviewLogPath(runPath) };
    },

    // A media slot declared as a generation is realized through the compiled preview-mock Graph path;
    // no Build or hand-written media fixture is used here.
    async render_element(input): Promise<Record<string, unknown>> {
      if (input.renders !== undefined) {
        const round = input.renders;
        assert(round.length > 0, "renders is empty");
        // Local work rather than a quota, so it is paced by the machine and not by the launch gap.
        // Every entry shares the same preview-mock stage and frame cache. Keep the realization
        // serialized so one worker cannot read a half-written preview.svrun while another is staging it;
        // `once` still makes the actual full-program draw happen only once for the round.
        const { done, failures } = await runBatch(round, { concurrency: 1, gapMs: 0 }, async (one) => await renderElement({
          ...one, run: one.run ?? input.run,
          ...(one.reference_id ?? input.reference_id === undefined ? {} : { reference_id: input.reference_id }),
        } as RenderElementInput));
        return {
          rendered: done.length,
          failed: failures.length,
          renders: done,
          ...(failures.length === 0 ? {} : { failures }),
        };
      }
      return await renderElement(input);
    },

    async render_previews(input): Promise<Record<string, unknown>> {
      return await renderPreviews(input);
    },

    async preview_check(input): Promise<Record<string, unknown>> {
      return await previewCheck(input, { packageRoot });
    },

    async layout_check(input): Promise<Record<string, unknown>> {
      return await layoutCheck(input);
    },

    async layout_accept(input): Promise<Record<string, unknown>> {
      return await layoutAccept(input);
    },

    async reconstruction_check(input): Promise<Record<string, unknown>> {
      return await authoringCheck({ ...input, mode: "reconstruction" }, { packageRoot });
    },

    async authoring_check(input): Promise<Record<string, unknown>> {
      return await authoringCheck({ ...input, mode: "description" }, { packageRoot });
    },

  };
  return tools;
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

function readmePath(
  specifier: string,
  root: string,
  loading: Parameters<typeof loadNodePackageSelection>[2] = {},
): string | undefined {
  try {
    const located = locateNodePackage(specifier, {
      from: join(root, "__hypit_reference_tools__.mjs"),
      workspaceRoots: [root],
      ...(loading.fallbackRoots === undefined ? {} : { distributionRoots: loading.fallbackRoots }),
    });
    return join(located.root, "README.md");
  } catch { return undefined; }
}
