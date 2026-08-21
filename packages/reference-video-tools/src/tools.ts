import { GoogleGenAI } from "@google/genai";
import type { Part } from "@google/genai";
import { access, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { loadNodePackageSelection } from "@hypit/package-loader-node";
import { markupSurfaceHostFacetAbi } from "@hypit/markup";
import type { RegisteredSurface, SurfaceVocabulary } from "@hypit/markup";
import { exactModelHostAbi } from "@hypit/model-kit";

import {
  assert,
  ensureDir,
  prepareMedia,
  probe,
  readJson,
  readBytes,
  referenceId,
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
  readonly shot_id: string;
  readonly image_path: string;
  readonly question?: string;
};

export type ReferenceVideoTools = {
  list_svml_packages(): Promise<Record<string, unknown>>;
  prepare_reference(input: PrepareReferenceInput): Promise<PrepareResult>;
  observe_reference(input: ObserveReferenceInput): Promise<Record<string, unknown>>;
  inspect_svml_vocabulary(input: InspectVocabularyInput): Promise<Record<string, unknown>>;
  compare_reconstruction(input: CompareReconstructionInput): Promise<Record<string, unknown>>;
  record_observation(input: RecordObservationInput): Promise<Record<string, unknown>>;
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

async function defaultGenerate(model: string): Promise<GenerateText> {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  assert(project, "GOOGLE_CLOUD_PROJECT is required");
  assert(credentials, "GOOGLE_APPLICATION_CREDENTIALS_JSON is required");
  let parsed: unknown;
  try { parsed = JSON.parse(credentials); } catch { throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON"); }
  assert(parsed !== null && typeof parsed === "object" && !Array.isArray(parsed), "Google credentials must be an object");
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
    if (tile !== undefined) pictures.push(tile);
    else if (path === state.analysis_video_ref) pictures.push(state.storyboard_ref);
    else if (!path.toLowerCase().endsWith(".wav")) pictures.push(path);
  }
  return [...new Set(pictures)];
}

// What the pictures are has to be said, because a tile of frames is not what the prompt was written
// for. The prompt itself is unchanged on both paths: only this preamble is added, and only here.
const TILE_PREAMBLE = "Each supplied picture that shows a grid of frames is one shot, sampled evenly"
  + " across its duration and laid out in reading order: left to right, then top to bottom. Read the"
  + " grid as time passing. A single picture that is not a grid is one moment.";
const NO_SOUND = "You are reading pictures and cannot hear this reference. Answer what the pictures and"
  + " the measured transcript support, and say plainly which parts of the question need sound you do"
  + " not have rather than inferring them from appearance.";

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

async function shotFromBound(root: string, index: number, bound: { start: number; end: number; group: number; part: number; parts: number }): Promise<Shot> {
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
    frames_tile_ref: join(dir, `${id}-frames.jpg`),
    audio_tail_ref,
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
        const media = await prepareMedia(videoPath, root, info.duration);
        const shots = await Promise.all(media.bounds.map((bound, index) => shotFromBound(root, index, bound)));
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
        : prepareTranscript(reference, videoPath, root, info.hasAudio, redoTranscript);
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
          prompt: `${globalContext}\n\nObserve shot ${shot.index}. Describe the current base picture, any covering or non-covering visual content, and whether visible content continues from the preceding shot. A full-screen insert is still only a picture observation.\n\nAlso answer these two questions explicitly.\n\nFirst: is the whole frame a depicted scene that has its own camera space, lighting, depth and lens behaviour, or is it a flat designed field whose purpose is to carry drawn elements such as words, rows, panels or cards? Live action and animation are both depicted scenes; a paper sheet, ruled or gridded surface, flat or gradient colour, blurred wallpaper, board or slide backdrop filling the frame is a designed field. State which one it is and the visible evidence for it.\n\nThen, whichever it is, say whether any *region* of the frame is itself a flat designed field carrying drawn content — a list, a ranking, a leaderboard, a scoreboard, a chart, a panel, a slab of colour holding rows or labels — even when the rest of the frame is a depicted scene, and even when the region has no visible border, card edge or drop shadow around it. Report each such region separately from the scene behind it: roughly where it sits and how much of the frame it covers, given as fractions of the frame width and height; what its own surface is; and what is drawn on it. A designed field occupying half the frame, one side of it, or a band across it is easy to describe as "text over the picture" and is not that: the field itself is the thing to report.\n\nSecond: for every framed element inside the picture, such as a card, phone, browser window, screenshot or inset, describe the picture inside the frame and the frame itself separately. For the inside, describe what it depicts and whether it moves. For the frame, describe its border, corner radius, outline, shadow, size, position and how it enters and leaves.\n\nThird: does this picture move at all, and how? Separate three things: whether the camera moves, and how; whether anything in the picture moves, and what; and whether the picture is completely still. A held photograph, screenshot or card that only appears and disappears is still, however long it is on screen.\n\nReturn natural language evidence only.`,
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
      const threeShotObservations = await pacedMap(windows, concurrency, gapMs, async (items) => {
        const result = await ask(`window:${items[0].shot_id}`, {
          media: items.map((shot) => shot.clip_ref),
          prompt: `Compare shots ${items[0].index}, ${items[1].index}, and ${items[2].index}. Decide whether the three clips are one continuous camera shot and whether one visual overlay or insert persists through both boundaries. Explain the evidence in natural language only.`,
          instruction: "Analyze a three-shot continuity window only. Do not write markup, SVML, JSON plans, or component names.",
        });
        return { shot_ids: items.map((shot) => shot.shot_id), combined_duration_seconds: Number((items[2].end_seconds - items[0].start_seconds).toFixed(3)), result };
      });
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
      const shot = state.shots.find((candidate) => candidate.shot_id === input.shot_id);
      assert(shot !== undefined, `shot ${input.shot_id} does not exist in reference ${input.reference_id}`);
      const imagePath = resolve(input.image_path);
      const file = await stat(imagePath).catch(() => undefined);
      assert(file?.isFile(), `image_path is not a file: ${imagePath}`);
      const scope = input.question?.trim() ?? "";
      const observer: Observer = state.observer ?? "gemini";
      const { ask, pending } = await askerFor(observer, state);
      const differences = await ask("comparison", {
        media: [shot.representative_frame_ref, imagePath],
        instruction: "You compare two supplied still images and describe their visible differences in natural language only. You are not told how either image was made. Do not write code, markup, SVML, component names, or production advice.",
        prompt: `Two still images are supplied in order: image one, then image two.${scope.length === 0 ? "" : `\n\nLimit the comparison to this part of the picture: ${scope}`}\n\nDescribe every visible difference between them: layout and arrangement, the position and size of each element, cropping and margins, colour, typeface, weight, letter and line spacing, alignment, outline or stroke, shadow, glow, borders and corner treatment, and anything present in one image and absent from the other. State plainly which differences are large enough to read as a different design and which are minor. If they are visually equivalent, say exactly that.\n\nDo not speculate about how either image was produced, which one is a source, or which one is a copy. Return natural language only.`,
      });
      return {
        reference_id: state.reference_id,
        observer,
        shot_id: shot.shot_id,
        reference_frame_ref: shot.representative_frame_ref,
        image_path: imagePath,
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
