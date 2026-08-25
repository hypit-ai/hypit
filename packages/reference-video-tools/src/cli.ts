#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { createReferenceVideoTools } from "./tools.js";
import type { CompareReconstructionInput, ObserveReferenceInput, RenderElementInput } from "./tools.js";

type Flags = ReadonlyMap<string, string | readonly string[] | boolean>;

function usage(): string {
  return [
    "Usage:",
    "  hypit-reference-video-tools list_svml_packages",
    "  hypit-reference-video-tools prepare_reference --video-path <path> [--observer gemini|agent] [--redo media|transcript|people|voices|systems|places|all]",
    "  hypit-reference-video-tools observe_reference --reference-id <id> [--shot-id <id> ...] [--reobserve]",
    "  hypit-reference-video-tools observe_reference --reference-id <id> --shot-id <id> [--shot-id <id> ...] --question <text>",
    "  hypit-reference-video-tools observe_reference --reference-id <id> --batch <questions.json>",
    "  hypit-reference-video-tools record_observation --reference-id <id> --key <key> --text <text>|--text-file <path>",
    "  hypit-reference-video-tools inspect_svml_vocabulary --package <name> [--package <name> ...] [--tag <tag> ...] [--without-previews]",
    "  hypit-reference-video-tools compare_reconstruction --reference-id <id> --run <build.svrun> --segment <id>|--selection <id> --video <path>|--image <path> [--question <scope>] [--element <id>]",
    "  hypit-reference-video-tools compare_reconstruction --reference-id <id> --shot-id <id> --video <path>|--image <path> [--question <scope>] [--element <id>]",
    "  hypit-reference-video-tools compare_reconstruction --reference-id <id> --batch <comparisons.json>",
    "  hypit-reference-video-tools make-placeholder --out <path> --width <w> --height <h> [--color light|mid|dark|white|black|#RRGGBB] [--video] [--seconds <s>]",
    "  hypit-reference-video-tools render_element <build.svrun> --element <id> --out <path.png|path.mp4> [--segment <id>] [--selection <id>] [--reference-id <id>]",
    "  hypit-reference-video-tools render_element <build.svrun> --batch <renders.json> [--reference-id <id>]",
    "  hypit-reference-video-tools render_previews <package-dir> [...]",
    "  hypit-reference-video-tools preview_check <build.svrun> [<hypit.runtime.json>]",
    "  hypit-reference-video-tools reconstruction_check <build.svrun> [--reference-id <id>]",
    "",
    "preview_check opens the Run the way Studio does and reports whether the graph traces. `sound` is",
    "true when every Track resolved, and also when the only thing missing is capabilities a Provider has",
    "still to serve — those are listed under `awaiting`. It takes the Run Source, not the Author SVML:",
    "Studio's unit of work is the Run, and it reads the .svml back out of it.",
    "",
    "reconstruction_check reports what the route can settle before a Build: which drawing elements have",
    "never been compared against the reference, which words of the Script nothing draws a full-frame",
    "picture over, and which timed pictures are configured to stop before their window ends. Comparison",
    "asks for participation rather than convergence, so an element compared once passes. With one",
    "prepared reference it uses that one; with several it requires --reference-id.",
    "Each element also carries the basis its comparisons were made on — reference, estimate, mixed, or",
    "not recorded — which says whether anything that changes with elapsed time inside its window has",
    "been looked at, or only its layout.",
    "",
    "It also reports every Frame with an edge outside 0%-100% of its Canvas, which places part of what",
    "is drawn into it off the picture. That is reported rather than required: an overhang is how an",
    "element slides in from off-screen and how a full-bleed picture is cropped by a fit, and a mistake",
    "looks the same. A comparison cannot answer it either way, because the render and the stand-in are",
    "drawn at the same Canvas and put the element in the same place off the edge.",
    "",
    "render_element draws one element of a Source the way that Source configures it, without a Build",
    "and without a Provider: the Canvas, frame rate, Recipe values and bindings are read from the",
    "Source, and the layers a Build has not made are mocked with make-placeholder at the Canvas's size.",
    "Name the stretch in words — --segment or --selection — so no reference timestamp is ever read",
    "across; without either, the whole program is drawn. An --out ending .mp4, .mov or .webm writes the",
    "stretch as a clip, and any other extension writes one still from the middle of it.",
    "",
    "--reference-id times the Segment skeleton from that reference's transcript. The Script was",
    "transcribed from the reference video, so its words are matched against the transcript's and each",
    "Segment runs for as long as the reference spends on them; anything whose appearance is a function",
    "of elapsed time inside its window is then compared at the pace it will be seen at. A Segment whose",
    "words the transcript does not carry is sized by the Source's own estimate:Speech, which is also",
    "what sizes every Segment when no reference is named. The result's `timing` says which of the two",
    "sized each Segment, and the same object is written to <out>.stand-in.json for",
    "compare_reconstruction to carry into the comparison log.",
    "",
    "render_previews draws a package's catalogue pictures from the package's own preview Source in",
    "preview/preview.svml, preview/recipes.svs and preview/build.svrun. Which element draws which file",
    "comes from the Manifest's own naming: a Surface tagged Track declares preview/Track.png, so",
    "Track.png is drawn from whichever element in the preview Source carries that tag. An .svg the",
    "Manifest promises is drawn by hand and left alone.",
    "",
    "--element names the reconstructed element the image draws. It is written to the reference's",
    "comparison log and never sent to the observer, so the comparison stays blind while a later gate can",
    "still tell which elements have been compared.",
    "",
    "compare_reconstruction takes the stretch of the reference two ways. --segment and --selection name",
    "a word range: the words come from the Author SVML of the Run given as --run, they are aligned",
    "against the reference's transcript, and the reference is cut from its own analysis video at the",
    "seconds it speaks them. That is the stretch a render covers, since a render is drawn over those",
    "same words, and one Segment routinely runs across several shots. Each end moves onto a shot",
    "boundary when one lies inside its own end word, so the pair opens and closes where the picture",
    "changes while still covering exactly the words asked for, and the rendered clip is trimmed by the",
    "seconds each end moved so both sides show the same word at the same offset. An end with no boundary",
    "inside its word leaves the pair part-way through a shot, and the prompt says how many seconds of it",
    "to read as an incomplete shot. --shot-id names a cut in the picture and compares that whole shot.",
    "",
    "--batch runs a whole round at once. The file holds a JSON array — or an object with a `comparisons`",
    "array — of the same objects a single call takes, minus reference_id, which comes from the flag:",
    "`[{\"run\": \"main.svrun\", \"segment\": \"pro\", \"video_path\": \"renders/board-pro.mp4\", \"element\": \"board\"}, …]`.",
    "Every render is finished before any comparison starts, so a round has no order to it; they are",
    "paced by HYPIT_REFERENCE_CONCURRENCY and each one's derived cuts are kept apart, so nothing in the",
    "round reads a file another is still writing. One comparison that fails takes only itself down and",
    "arrives under `failures` with the input that produced it; the rest are under `comparisons`.",
    "",
    "--video compares the whole stretch instead of one frame of it, which is what removes the problem of",
    "choosing a characteristic frame for an element that animates in, leaves, or is replaced without a",
    "cut. The `gemini` observer receives the two clips; the `agent` observer receives two frame tiles,",
    "both tiled against the compared stretch's own duration so the grids sample alike. Use --image only",
    "when the reference's own visual observation states the element is completely still.",
    "",
    "Both sides of a --video pair are measured once they are cut to the same stretch, and a pair that is",
    "completely still on both sides is compared as one frame from each: `compared` reads `still` and",
    "`both_sides_still` says why. Both sides have to be still, because a render's base is a flat",
    "placeholder and is therefore still whatever the reference does.",
    "",
    "make-placeholder writes a correctly-sized placeholder for a media slot the Source declares as a",
    "generation and a Build has not filled. It is deterministic and Provider-free: the comparison loop",
    "uses its output to mock an empty slot, and the observer is told the slot is a placeholder so it is",
    "bypassed rather than reported as a difference. `--color` picks the fill from the named presets (the",
    "default `light` shows on a dark base; `dark` shows on a light one) or a six-digit hex, and the",
    "inset border is the contrast of the fill so the mock stays visible on either. A plain call writes",
    "a PNG; `--video` writes a short solid-colour MP4 via ffmpeg for a slot that only accepts video,",
    "with `--seconds` choosing its length (default 1). Never produce the mock with `hypit image` or a",
    "script written by hand.",
    "",
    "--element names the reconstructed element the image draws. It is written to the reference's",
    "comparison log and never sent to the observer, so the comparison stays blind while a later gate can",
    "still tell which elements have been compared.",
    "",
    "record_observation takes the keys the agent observer is handed: the four whole-reference keys, a",
    "shot key such as visual:003 or boundary:004, a narrow question keyed by the shots it was asked over",
    "(question:003+004), and a comparison keyed by the `comparison_id` compare_reconstruction returned",
    "(comparison:<id>). A comparison's answer is written back onto its own line of the log, which is",
    "what makes it count toward coverage; until then reconstruction_check lists it under",
    "`awaiting_answer`.",
    "",
    "--observer picks who reads the reference, once per reference. `gemini` uploads video to Vertex and",
    "needs GOOGLE_CLOUD_PROJECT and GOOGLE_APPLICATION_CREDENTIALS_JSON. `agent` needs no credentials: it",
    "returns each observation as a task carrying its prompt and one tiled picture per shot, which the",
    "calling agent answers with record_observation.",
    "",
    "--package-root <dir> is where the packages a Source imports are resolved from, and it is accepted by",
    "every command. It defaults to the working directory. A project that declares a vocabulary gap and",
    "fills it publishes those packages under its own scope and installs them against the project root, so",
    "run these commands from the project directory or name it here: resolved from anywhere else, the",
    "project's own packages are not found, and reconstruction_check reports them under",
    "`unresolved_packages` rather than asking for a comparison of what they draw.",
    "",
    "Every command prints one JSON result to stdout. Use --input <json> instead of flags when a complete input object is easier to pass.",
  ].join("\n");
}

// The authoring and check commands name what they act on positionally — a Run for `render_element`,
// `preview_check` and `reconstruction_check`, one or more package directories for `render_previews` —
// so a token that is not a flag is collected rather than refused. Every other command still refuses
// one, which is why the check is made per command rather than dropped here.
const COMMANDS_WITH_OPERANDS = new Set(["render_element", "render_previews", "preview_check", "reconstruction_check"]);

function parse(argv: readonly string[]): { readonly command: string; readonly operands: readonly string[]; readonly flags: Flags } {
  const command = argv[0];
  if (command === undefined || command === "--help" || command === "-h") throw new Error(usage());
  const values = new Map<string, string | string[] | boolean>();
  const operands: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      if (!COMMANDS_WITH_OPERANDS.has(command)) throw new Error(`unexpected argument ${token}\n\n${usage()}`);
      operands.push(token);
      continue;
    }
    const name = token.slice(2);
    if (name.length === 0) throw new Error("empty option name");
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      values.set(name, true);
      continue;
    }
    index += 1;
    const current = values.get(name);
    if (current === undefined) values.set(name, next);
    else values.set(name, [...(Array.isArray(current) ? current : [String(current)]), next]);
  }
  return { command, operands, flags: values };
}

function one(flags: Flags, name: string): string | undefined {
  const value = flags.get(name);
  if (value === undefined || typeof value === "boolean") return undefined;
  return Array.isArray(value) ? value.at(-1) : typeof value === "string" ? value : undefined;
}

function many(flags: Flags, name: string): readonly string[] {
  const value = flags.get(name);
  if (value === undefined || typeof value === "boolean") return [];
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
}

function required(flags: Flags, name: string): string {
  const value = one(flags, name);
  if (value === undefined || value.trim().length === 0) throw new Error(`--${name} is required`);
  return value;
}

function inputObject(flags: Flags): Record<string, unknown> | undefined {
  const raw = one(flags, "input");
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch (error) { throw new Error(`--input is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("--input must contain a JSON object");
  return parsed as Record<string, unknown>;
}

// stdout carries exactly one JSON result. Dependencies that announce themselves on stdout would
// corrupt it, so everything they write is moved to stderr and only `report` reaches stdout.
const report = process.stdout.write.bind(process.stdout);
process.stdout.write = ((chunk: string | Uint8Array, ...rest: readonly unknown[]): boolean =>
  (process.stderr.write as (...args: readonly unknown[]) => boolean)(chunk, ...rest)) as typeof process.stdout.write;

async function main(): Promise<void> {
  const { command, operands, flags } = parse(process.argv.slice(2));
  if (flags.has("rebuild") || flags.has("refresh")) {
    throw new Error("--rebuild and --refresh were removed; use --redo on prepare_reference or --reobserve on observe_reference");
  }
  // Where the Source's imports are resolved from. A project publishing its own packages installs them
  // against the project root, so a root taken from anywhere else resolves none of them: --package-root
  // is how a command run from elsewhere reaches them. HYPIT_DISTRIBUTION_ROOT names an installed
  // Distribution and is the fallback for the installed packages a project does not carry.
  const resolveFrom = one(flags, "package-root") ?? process.env.HYPIT_DISTRIBUTION_ROOT;
  const tools = createReferenceVideoTools({
    ...(resolveFrom === undefined ? {} : { packageRoot: resolveFrom }),
  });
  const supplied = inputObject(flags);
  let result: unknown;
  if (command === "list_svml_packages") {
    result = await tools.list_svml_packages();
  } else if (command === "prepare_reference") {
    const observer = one(flags, "observer");
    if (observer !== undefined && observer !== "gemini" && observer !== "agent") throw new Error("--observer must be gemini or agent");
    const input = supplied ?? {
      video_path: required(flags, "video-path"),
      ...(observer === undefined ? {} : { observer }),
      ...(one(flags, "redo") === undefined ? {} : { redo: one(flags, "redo") }),
    };
    result = await tools.prepare_reference(input as { video_path: string; observer?: "gemini" | "agent"; redo?: "media" | "transcript" | "people" | "voices" | "systems" | "places" | "all" });
  } else if (command === "observe_reference") {
    // A round of narrow questions is a list, and a list is too long for flags.
    const askFile = one(flags, "batch");
    if (askFile !== undefined) {
      const parsed: unknown = JSON.parse(await readFile(askFile, "utf8"));
      const list = Array.isArray(parsed) ? parsed : (parsed as { questions?: unknown }).questions;
      if (!Array.isArray(list)) throw new Error(`${askFile} must hold a JSON array of {shot_ids, question}, or an object with a "questions" array`);
      result = await tools.observe_reference({
        reference_id: required(flags, "reference-id"),
        questions: list as ObserveReferenceInput["questions"] & object,
      });
      report(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    const input = supplied ?? {
      reference_id: required(flags, "reference-id"),
      ...(many(flags, "shot-id").length === 0 ? {} : { shot_ids: many(flags, "shot-id") }),
      ...(one(flags, "question") === undefined ? {} : { question: one(flags, "question") }),
      ...(flags.get("reobserve") === true ? { reobserve: true } : {}),
    };
    result = await tools.observe_reference(input as { reference_id: string; shot_ids?: readonly string[]; question?: string; reobserve?: boolean });
  } else if (command === "record_observation") {
    // An observation is paragraphs of prose. --text keeps a short one on the command line; --text-file
    // is how a long one arrives without the shell deciding where it ends.
    const textFile = one(flags, "text-file");
    const input = supplied ?? {
      reference_id: required(flags, "reference-id"),
      key: required(flags, "key"),
      text: textFile === undefined ? required(flags, "text") : await readFile(textFile, "utf8"),
    };
    result = await tools.record_observation(input as { reference_id: string; key: string; text: string });
  } else if (command === "compare_reconstruction") {
    // A round is a list of comparisons, and a list is too long for flags. --batch names a JSON file
    // holding it, which is also how it survives being written by one step and read by another.
    const batchFile = one(flags, "batch");
    if (batchFile !== undefined) {
      const parsed: unknown = JSON.parse(await readFile(batchFile, "utf8"));
      const list = Array.isArray(parsed) ? parsed : (parsed as { comparisons?: unknown }).comparisons;
      if (!Array.isArray(list)) throw new Error(`${batchFile} must hold a JSON array of comparisons, or an object with a "comparisons" array`);
      result = await tools.compare_reconstruction({
        reference_id: required(flags, "reference-id"),
        comparisons: list as CompareReconstructionInput["comparisons"] & object,
      });
      report(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    const video = one(flags, "video");
    const segment = one(flags, "segment");
    const selection = one(flags, "selection");
    const range = segment !== undefined || selection !== undefined;
    const input = supplied ?? {
      reference_id: required(flags, "reference-id"),
      ...(range
        ? {
          run: required(flags, "run"),
          ...(segment === undefined ? {} : { segment }),
          ...(selection === undefined ? {} : { selection }),
        }
        : { shot_id: required(flags, "shot-id") }),
      ...(video === undefined ? { image_path: required(flags, "image") } : { video_path: video }),
      ...(one(flags, "question") === undefined ? {} : { question: one(flags, "question") }),
      ...(one(flags, "element") === undefined ? {} : { element: one(flags, "element") }),
    };
    result = await tools.compare_reconstruction(input as { reference_id: string; shot_id?: string; segment?: string; selection?: string; run?: string; image_path?: string; video_path?: string; question?: string; element?: string });
  } else if (command === "inspect_svml_vocabulary") {
    const packages = many(flags, "package");
    const input = supplied ?? {
      package_names: packages.length > 0 ? packages : [required(flags, "package-name")],
      ...(many(flags, "tag").length === 0 ? {} : { tags: many(flags, "tag") }),
      ...(flags.get("without-previews") === true ? { include_previews: false } : {}),
    };
    result = await tools.inspect_svml_vocabulary(input as { package_names: readonly string[]; tags?: readonly string[]; include_previews?: boolean });
  } else if (command === "make-placeholder") {
    const input = supplied ?? {
      out: required(flags, "out"),
      width: Number(required(flags, "width")),
      height: Number(required(flags, "height")),
      ...(one(flags, "color") === undefined ? {} : { color: one(flags, "color") }),
      ...(flags.get("video") === true ? { video: true } : {}),
      ...(one(flags, "seconds") === undefined ? {} : { seconds: Number(one(flags, "seconds")) }),
    };
    result = await tools.make_placeholder(input as { out: string; width: number; height: number; color?: string; video?: boolean; seconds?: number });
  } else if (command === "render_element") {
    const renderFile = one(flags, "batch");
    if (renderFile !== undefined) {
      const parsed: unknown = JSON.parse(await readFile(renderFile, "utf8"));
      const list = Array.isArray(parsed) ? parsed : (parsed as { renders?: unknown }).renders;
      if (!Array.isArray(list)) throw new Error(`${renderFile} must hold a JSON array of renders, or an object with a "renders" array`);
      result = await tools.render_element({
        ...(operands[0] === undefined ? {} : { run: operands[0] }),
        ...(one(flags, "reference-id") === undefined ? {} : { reference_id: one(flags, "reference-id") }),
        renders: list,
      } as RenderElementInput);
      report(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    const run = operands[0];
    if (supplied === undefined && run === undefined) throw new Error(`a <build.svrun> is required\n\n${usage()}`);
    const input = supplied ?? {
      run,
      element: required(flags, "element"),
      out: required(flags, "out"),
      ...(one(flags, "segment") === undefined ? {} : { segment: one(flags, "segment") }),
      ...(one(flags, "selection") === undefined ? {} : { selection: one(flags, "selection") }),
      ...(one(flags, "reference-id") === undefined ? {} : { reference_id: one(flags, "reference-id") }),
    };
    result = await tools.render_element(input as { run: string; element: string; out: string; segment?: string; selection?: string; reference_id?: string });
  } else if (command === "render_previews") {
    if (supplied === undefined && operands.length === 0) throw new Error(`a <package-dir> is required\n\n${usage()}`);
    const input = supplied ?? { package_dirs: operands };
    result = await tools.render_previews(input as { package_dirs: readonly string[] });
  } else if (command === "preview_check") {
    // The runtime archive is the second operand rather than a flag, the way the Run itself is: both
    // name a file this command opens, and the pair reads as one argument list.
    const run = operands[0];
    if (supplied === undefined && run === undefined) throw new Error(`a <build.svrun> is required\n\n${usage()}`);
    const input = supplied ?? {
      run,
      ...(operands[1] === undefined ? {} : { runtime: operands[1] }),
    };
    result = await tools.preview_check(input as { run: string; runtime?: string });
  } else if (command === "reconstruction_check") {
    const run = operands[0];
    if (supplied === undefined && run === undefined) throw new Error(`a <build.svrun> is required\n\n${usage()}`);
    const input = supplied ?? {
      run,
      ...(one(flags, "reference-id") === undefined ? {} : { reference_id: one(flags, "reference-id") }),
    };
    result = await tools.reconstruction_check(input as { run: string; reference_id?: string });
  } else {
    throw new Error(`unknown command ${command}\n\n${usage()}`);
  }
  report(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
