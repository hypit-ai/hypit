import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { CliIo } from "@hypit/cli";

import { generateVideoCliPicture } from "./picture.js";

type ImageArgs = {
  readonly prompt: string;
  readonly to: string;
  readonly model?: string;
  readonly aspectRatio?: string;
  readonly resolution?: string;
  readonly json: boolean;
};

async function nearestPackageRoot(start: string): Promise<string> {
  let directory = resolve(start);
  while (true) {
    const manifest = resolve(directory, "package.json");
    if (await stat(manifest).then((item) => item.isFile(), () => false)) return directory;
    const parent = dirname(directory);
    if (parent === directory) return resolve(start);
    directory = parent;
  }
}

async function promptText(value: string): Promise<string> {
  const path = resolve(value);
  const isFile = await stat(path).then((item) => item.isFile(), () => false);
  const prompt = (isFile ? await readFile(path, "utf8") : value).trim();
  if (prompt.length === 0) throw new Error(isFile ? `prompt file ${path} is empty` : "--prompt is empty");
  return prompt;
}

function parseImageArgs(argv: readonly string[]): ImageArgs {
  let prompt: string | undefined;
  let to: string | undefined;
  let model: string | undefined;
  let aspectRatio: string | undefined;
  let resolution: string | undefined;
  let json = false;
  const seen = new Set<string>();
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index]!;
    if (option === "--json") { json = true; continue; }
    if (option === "--debug" || option === "--verbose" || option === "--no-color") continue;
    if (option === "--color") {
      const value = argv[index + 1];
      if (value !== "auto" && value !== "always" && value !== "never") {
        throw new Error("--color requires auto, always or never");
      }
      index += 1;
      continue;
    }
    if (!["--prompt", "--to", "--model", "--aspect-ratio", "--resolution"].includes(option)) {
      throw new Error(`unknown option ${option}`);
    }
    if (seen.has(option)) throw new Error(`${option} cannot be repeated`);
    seen.add(option);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${option} requires a value`);
    if (option === "--prompt") prompt = value;
    else if (option === "--to") to = resolve(value);
    else if (option === "--model") model = value;
    else if (option === "--aspect-ratio") aspectRatio = value;
    else resolution = value;
    index += 1;
  }
  if (prompt === undefined) throw new Error("image requires --prompt with text or a text file path");
  if (to === undefined) throw new Error("image requires --to with the file to write");
  return { prompt, to, json, ...(model === undefined ? {} : { model }),
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
    ...(resolution === undefined ? {} : { resolution }) };
}

export function writeVideoImageHelp(io: CliIo): void {
  io.write([
    "hypit image",
    "Generate one image file used as video authoring input.",
    "",
    "  hypit image --prompt <text|file> --to <path> [--model <package>]",
    "              [--aspect-ratio <ratio>] [--resolution <size>]",
    "",
    "This is a video-distribution utility. It creates no Build or Result.",
    "",
  ].join("\n"));
}

export async function runVideoImageCli(
  argv: readonly string[],
  io: CliIo,
  distributionPackageRoot?: string,
): Promise<void> {
  const args = parseImageArgs(argv);
  if (await stat(args.to).then(() => true, () => false)) {
    throw new Error(`Image destination ${args.to} already exists`);
  }
  const picture = await generateVideoCliPicture({
    prompt: await promptText(args.prompt),
    packageRoot: await nearestPackageRoot(process.cwd()),
    ...(distributionPackageRoot === undefined ? {} : { distributionPackageRoot }),
    ...(args.model === undefined ? {} : { model: args.model }),
    ...(args.aspectRatio === undefined ? {} : { aspectRatio: args.aspectRatio }),
    ...(args.resolution === undefined ? {} : { resolution: args.resolution }),
  });
  await mkdir(dirname(args.to), { recursive: true });
  try {
    await writeFile(args.to, picture.bytes, { flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error(`Image destination ${args.to} already exists`);
    }
    throw error;
  }
  const view = {
    format: "hypit.video-cli-image@1",
    model: picture.model,
    package: picture.package,
    mediaType: picture.mediaType,
    bytes: picture.bytes.byteLength,
    path: args.to,
  } as const;
  if (args.json) io.write(`${JSON.stringify(view, null, 2)}\n`);
  else io.write(`✓ Picture written\n\n  ${picture.model} · ${picture.mediaType}\n  ${args.to}\n`);
}
