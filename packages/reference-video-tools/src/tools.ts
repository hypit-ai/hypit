import { GoogleGenAI } from "@google/genai";
import type { Part } from "@google/genai";
import { access, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { loadNodePackageSelection } from "@hypit/package-loader-node";
import type { RegisteredSurface, SurfaceVocabulary } from "@hypit/markup";

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
import type { Observation, PrepareResult, ReferenceState, Shot } from "./types.js";

export type PrepareReferenceInput = {
  readonly video_path: string;
  readonly redo?: "media" | "people" | "voices" | "all";
};
export type ObserveReferenceInput = {
  readonly reference_id: string;
  readonly shot_ids?: readonly string[];
  readonly question?: string;
};
export type InspectVocabularyInput = {
  readonly package_names: readonly string[];
  readonly tags?: readonly string[];
  readonly include_previews?: boolean;
};

export type ReferenceVideoTools = {
  prepare_reference(input: PrepareReferenceInput): Promise<PrepareResult>;
  observe_reference(input: ObserveReferenceInput): Promise<Record<string, unknown>>;
  inspect_svml_vocabulary(input: InspectVocabularyInput): Promise<Record<string, unknown>>;
};

type ToolOptions = {
  readonly workspaceRoot?: string;
  readonly packageRoot?: string;
  readonly model?: string;
  readonly concurrency?: number;
  readonly launchGapMs?: number;
  readonly generate?: GenerateText;
};
type GenerateText = (input: { readonly parts: readonly Part[]; readonly instruction: string }) => Promise<string>;
type ObservationTask = { readonly key: string; readonly run: () => Promise<Observation> };

function observation(status: "complete" | "failed", text: string): Observation { return { status, text }; }

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

async function mediaPart(path: string): Promise<Part> {
  const bytes = await readBytes(path);
  const extension = path.toLowerCase().split(".").pop();
  const mimeType = extension === "jpg" || extension === "jpeg" ? "image/jpeg"
    : extension === "wav" ? "audio/wav" : extension === "mp4" ? "video/mp4" : "application/octet-stream";
  return { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } };
}

function rateLimited(error: unknown): boolean {
  return /\b429\b|resource[ _]exhausted|quota|rate limit/iu.test(error instanceof Error ? error.message : String(error));
}

async function callSafely(generate: GenerateText, parts: readonly Part[], instruction: string): Promise<Observation> {
  let last: unknown;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try { return observation("complete", await generate({ parts, instruction })); }
    catch (error) {
      last = error;
      if (attempt === 6) break;
      const wait = rateLimited(error) ? Math.min(900_000, 45_000 * 2 ** (attempt - 1)) : 2_000 * attempt;
      await new Promise((resolveWait) => setTimeout(resolveWait, wait));
    }
  }
  return observation("failed", last instanceof Error ? last.message : String(last));
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
): Promise<ReadonlyMap<string, Observation>> {
  const path = join(root, "observations.json");
  const cache = await readJson<Record<string, Observation>>(path) ?? {};
  const pending = tasks.filter((task) => forcedKeys.has(task.key) || cache[task.key]?.status !== "complete");
  const completed = await pacedMap(pending, concurrency, gapMs, async (task) => ({ key: task.key, value: await task.run() }));
  for (const item of completed) cache[item.key] = item.value;
  await writeJson(path, cache);
  return new Map(tasks.map((task) => [task.key, cache[task.key] ?? observation("failed", "not observed")]));
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
    audio_tail_ref,
  };
}

function publicPrepare(state: ReferenceState): PrepareResult {
  return {
    reference_id: state.reference_id,
    status: state.people_and_product?.status === "complete" && state.voices?.status === "complete" ? "ready" : "partial",
    video: state.video,
    shots: state.shots,
    storyboard_ref: state.storyboard_ref,
    people_and_product: state.people_and_product ?? observation("failed", "not analyzed"),
    voices: state.voices ?? observation("failed", "not analyzed"),
  };
}

export function createReferenceVideoTools(options: ToolOptions = {}): ReferenceVideoTools {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const packageRoot = resolve(options.packageRoot ?? workspaceRoot);
  const model = options.model ?? process.env.GEMINI_MODEL?.trim() ?? "gemini-3.1-pro-preview";
  const concurrency = options.concurrency ?? 2;
  const gapMs = options.launchGapMs ?? 6_000;
  let generatorPromise: Promise<GenerateText> | undefined;
  const generator = async (): Promise<GenerateText> => generatorPromise ??= options.generate === undefined ? defaultGenerate(model) : Promise.resolve(options.generate);

  const loadState = async (reference: string): Promise<ReferenceState> => {
    const path = join(stateRoot(workspaceRoot, reference), "state.json");
    const state = await readJson<ReferenceState>(path);
    assert(state !== undefined, `reference ${reference} was not prepared in ${workspaceRoot}`);
    return state;
  };

  return {
    async prepare_reference(input): Promise<PrepareResult> {
      assert(input.redo === undefined || input.redo === "media" || input.redo === "people" || input.redo === "voices" || input.redo === "all", "redo must be one of: media, people, voices, all");
      const videoPath = resolve(input.video_path);
      const file = await stat(videoPath).catch(() => undefined);
      assert(file?.isFile(), `video_path is not a file: ${videoPath}`);
      const reference = await referenceId(videoPath);
      const root = stateRoot(workspaceRoot, reference);
      const statePath = join(root, "state.json");
      let existing = await readJson<ReferenceState>(statePath);
      const redoMedia = input.redo === "media" || input.redo === "all";
      const redoPeople = input.redo === "people" || input.redo === "all";
      const redoVoices = input.redo === "voices" || input.redo === "all";
      if (input.redo === undefined) {
        if (existing !== undefined && existing.people_and_product?.status === "complete" && existing.voices?.status === "complete") return publicPrepare(existing);
      }
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
          ...(existing?.people_and_product === undefined ? {} : { people_and_product: existing.people_and_product }),
          ...(existing?.voices === undefined ? {} : { voices: existing.voices }),
        };
        analysisVideo = media.analysisVideo;
        await writeJson(statePath, state);
        await writeFile(join(root, "observations.json"), "{}\n", "utf8");
      }
      const generate = await generator();
      const globalParts: Part[] = [await mediaPart(analysisVideo)];
      const [people, voices] = await Promise.all([
        state.people_and_product?.status === "complete" && !redoPeople
          ? Promise.resolve(state.people_and_product)
          : callSafely(generate, [...globalParts, { text: "Describe the recurring people and the promoted product in this complete reference video. Return natural language only. Identify stable visual traits and distinguish recurring speakers from incidental people in inserts. Describe the product once, comprehensively, for reuse." }], "You only observe a reference video. Return natural language evidence only. Do not write code, markup, SVML, or component names."),
        state.voices?.status === "complete" && !redoVoices
          ? Promise.resolve(state.voices)
          : callSafely(generate, [...globalParts, { text: "Listen to this complete reference video and describe the distinct voices, their order, overlap, off-screen speech, and likely correspondence to visible people. Do not assign a voice merely because a person appears in a B-roll image. Return natural language only." }], "You only listen to a reference video. Return natural language evidence only. Do not write code, markup, SVML, or component names."),
      ]);
      const complete: ReferenceState = { ...state, people_and_product: people, voices };
      await writeJson(statePath, complete);
      return publicPrepare(complete);
    },

    async observe_reference(input): Promise<Record<string, unknown>> {
      const state = await loadState(input.reference_id);
      const selected = input.shot_ids === undefined ? state.shots : state.shots.filter((shot) => input.shot_ids!.includes(shot.shot_id));
      assert(selected.length > 0, "no requested shot ids exist");
      const selectedIds = new Set(selected.map((shot) => shot.shot_id));
      const boundaryRights = state.shots.filter((shot) => {
        const left = state.shots.find((candidate) => candidate.index === shot.index - 1);
        return left !== undefined && (selectedIds.has(left.shot_id) || selectedIds.has(shot.shot_id));
      });
      const generate = await generator();
      const globalContext = [
        state.people_and_product?.text === undefined ? "" : `Full-reference people and product evidence:\n${state.people_and_product.text}`,
        state.voices?.text === undefined ? "" : `Full-reference voice evidence:\n${state.voices.text}`,
      ].filter((item) => item.length > 0).join("\n\n");
      const visualTasks: ObservationTask[] = selected.map((shot) => ({ key: `visual:${shot.shot_id}`, run: async () => {
        const previous = state.shots.find((candidate) => candidate.index === shot.index - 1);
        const parts: Part[] = [await mediaPart(shot.clip_ref), await mediaPart(shot.representative_frame_ref)];
        if (previous !== undefined) parts.push(await mediaPart(previous.tail_frame_ref));
        parts.push({ text: `${globalContext}\n\nObserve shot ${shot.index}. Describe the current base picture, any covering or non-covering visual content, and whether visible content continues from the preceding shot. A full-screen insert is still only a picture observation. Return natural language evidence only.` });
        return await callSafely(generate, parts, "Observe picture only. Do not choose SVML components, do not write markup, and do not decide final source syntax.");
      }}));
      const audioTasks: ObservationTask[] = selected.map((shot) => ({ key: `audio:${shot.shot_id}`, run: async () => {
        const previous = state.shots.find((candidate) => candidate.index === shot.index - 1);
        const parts: Part[] = [await mediaPart(shot.clip_ref)];
        if (previous?.audio_tail_ref !== null && previous?.audio_tail_ref !== undefined) parts.push(await mediaPart(previous.audio_tail_ref));
        parts.push({ text: `${globalContext}\n\nListen to shot ${shot.index}. Decide who is speaking, whether sound continues from the previous shot, whether visible people actually produce the sound, and whether a silent B-roll person only appears to speak. Handle off-screen, alternating, overlapping, and no-person-visible speech. Return natural language evidence only.` });
        return await callSafely(generate, parts, "Observe sound only. Do not write markup, SVML, JSON plans, or component names.");
      }}));
      const sameTakeTasks: ObservationTask[] = boundaryRights.map((right) => ({ key: `same-take:${right.shot_id}`, run: async () => {
        const left = state.shots.find((shot) => shot.index === right.index - 1)!;
        const parts: Part[] = [await mediaPart(left.clip_ref), await mediaPart(right.clip_ref), await mediaPart(left.tail_frame_ref)];
        parts.push({ text: `Compare shots ${left.index} and ${right.index}. Answer only whether they are one continuous camera shot. Explain the visual and sound continuity evidence in natural language.` });
        return await callSafely(generate, parts, "Analyze camera continuity only. Do not name SVML components or write code.");
      }}));
      const overlayTasks: ObservationTask[] = boundaryRights.map((right) => ({ key: `overlay:${right.shot_id}`, run: async () => {
        const left = state.shots.find((shot) => shot.index === right.index - 1)!;
        const parts: Part[] = [await mediaPart(left.clip_ref), await mediaPart(right.clip_ref), await mediaPart(left.tail_frame_ref)];
        parts.push({ text: `Compare shots ${left.index} and ${right.index}. Answer only whether the same visible overlay or inserted picture continues across the boundary, changes, or ends. Explain the evidence in natural language.` });
        return await callSafely(generate, parts, "Analyze overlay continuity only. Do not name SVML components or write code.");
      }}));
      const allTasks = [...visualTasks, ...audioTasks, ...sameTakeTasks, ...overlayTasks];
      const forcedKeys = input.shot_ids === undefined
        ? new Set<string>()
        : new Set(allTasks
          .filter((task) => selectedIds.has(task.key.split(":")[1]!) || boundaryRights.some((right) => task.key.endsWith(`:${right.shot_id}`)))
          .map((task) => task.key));
      const observations = await runObservationTasks(state.root, allTasks, forcedKeys, concurrency, gapMs);
      const unresolved: string[] = [];
      const boundaryText = boundaryRights.map((right) => `${observations.get(`same-take:${right.shot_id}`)?.text ?? ""}\n${observations.get(`overlay:${right.shot_id}`)?.text ?? ""}`).join("\n");
      const needsThreeShotReview = selected.length >= 3 && (
        input.shot_ids !== undefined ||
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
        const parts: Part[] = [];
        for (const shot of items) parts.push(await mediaPart(shot.clip_ref));
        parts.push({ text: `Compare shots ${items[0].index}, ${items[1].index}, and ${items[2].index}. Decide whether the three clips are one continuous camera shot and whether one visual overlay or insert persists through both boundaries. Explain the evidence in natural language only.` });
        const result = await callSafely(generate, parts, "Analyze a three-shot continuity window only. Do not write markup, SVML, JSON plans, or component names.");
        return { shot_ids: items.map((shot) => shot.shot_id), combined_duration_seconds: Number((items[2].end_seconds - items[0].start_seconds).toFixed(3)), result };
      });
      const shotResults = selected.map((shot) => ({ shot_id: shot.shot_id, visual: observations.get(`visual:${shot.shot_id}`)!, audio: observations.get(`audio:${shot.shot_id}`)! }));
      const boundaryResults = boundaryRights.map((right) => {
        const left = state.shots.find((shot) => shot.index === right.index - 1)!;
        return {
          left_shot_id: left.shot_id,
          right_shot_id: right.shot_id,
          combined_duration_seconds: Number((right.end_seconds - left.start_seconds).toFixed(3)),
          within_15_seconds: right.end_seconds - left.start_seconds <= 15,
          same_take: observations.get(`same-take:${right.shot_id}`)!,
          overlay_continuity: observations.get(`overlay:${right.shot_id}`)!,
        };
      });
      if (input.question !== undefined && input.question.trim().length > 0) {
        const parts: Part[] = [];
        for (const shot of selected.slice(0, 3)) parts.push(await mediaPart(shot.clip_ref));
        parts.push({ text: input.question });
        const follow = await callSafely(generate, parts, "Answer only the user's narrow reference-video question in natural language. Do not write code, markup, SVML, or component names.");
        return { reference_id: state.reference_id, shots: shotResults, boundaries: boundaryResults, three_shot_observations: threeShotObservations, follow_ups: [{ shot_ids: selected.slice(0, 3).map((shot) => shot.shot_id), question: input.question, text: follow.text }], unresolved };
      }
      return {
        reference_id: state.reference_id,
        shots: shotResults,
        boundaries: boundaryResults,
        three_shot_observations: threeShotObservations,
        follow_ups: [],
        unresolved,
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
  };
}

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
