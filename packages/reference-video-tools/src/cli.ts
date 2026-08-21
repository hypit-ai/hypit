#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { createReferenceVideoTools } from "./tools.js";

type Flags = ReadonlyMap<string, string | readonly string[] | boolean>;

function usage(): string {
  return [
    "Usage:",
    "  hypit-reference-video-tools list_svml_packages",
    "  hypit-reference-video-tools prepare_reference --video-path <path> [--observer gemini|agent] [--redo media|transcript|people|voices|systems|places|all]",
    "  hypit-reference-video-tools observe_reference --reference-id <id> [--shot-id <id> ...] [--reobserve]",
    "  hypit-reference-video-tools observe_reference --reference-id <id> --shot-id <id> [--shot-id <id> ...] --question <text>",
    "  hypit-reference-video-tools record_observation --reference-id <id> --key <key> --text <text>|--text-file <path>",
    "  hypit-reference-video-tools inspect_svml_vocabulary --package <name> [--package <name> ...] [--tag <tag> ...] [--without-previews]",
    "  hypit-reference-video-tools compare_reconstruction --reference-id <id> --shot-id <id> --image <path> [--question <scope>]",
    "",
    "--observer picks who reads the reference, once per reference. `gemini` uploads video to Vertex and",
    "needs GOOGLE_CLOUD_PROJECT and GOOGLE_APPLICATION_CREDENTIALS_JSON. `agent` needs no credentials: it",
    "returns each observation as a task carrying its prompt and one tiled picture per shot, which the",
    "calling agent answers with record_observation.",
    "",
    "Every command prints one JSON result to stdout. Use --input <json> instead of flags when a complete input object is easier to pass.",
  ].join("\n");
}

function parse(argv: readonly string[]): { readonly command: string; readonly flags: Flags } {
  const command = argv[0];
  if (command === undefined || command === "--help" || command === "-h") throw new Error(usage());
  const values = new Map<string, string | string[] | boolean>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}\n\n${usage()}`);
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
  return { command, flags: values };
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
  const { command, flags } = parse(process.argv.slice(2));
  if (flags.has("rebuild") || flags.has("refresh")) {
    throw new Error("--rebuild and --refresh were removed; use --redo on prepare_reference or --reobserve on observe_reference");
  }
  const tools = createReferenceVideoTools();
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
    const input = supplied ?? {
      reference_id: required(flags, "reference-id"),
      shot_id: required(flags, "shot-id"),
      image_path: required(flags, "image"),
      ...(one(flags, "question") === undefined ? {} : { question: one(flags, "question") }),
    };
    result = await tools.compare_reconstruction(input as { reference_id: string; shot_id: string; image_path: string; question?: string });
  } else if (command === "inspect_svml_vocabulary") {
    const packages = many(flags, "package");
    const input = supplied ?? {
      package_names: packages.length > 0 ? packages : [required(flags, "package-name")],
      ...(many(flags, "tag").length === 0 ? {} : { tags: many(flags, "tag") }),
      ...(flags.get("without-previews") === true ? { include_previews: false } : {}),
    };
    result = await tools.inspect_svml_vocabulary(input as { package_names: readonly string[]; tags?: readonly string[]; include_previews?: boolean });
  } else {
    throw new Error(`unknown command ${command}\n\n${usage()}`);
  }
  report(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
