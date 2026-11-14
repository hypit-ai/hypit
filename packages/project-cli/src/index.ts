import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import type { CliCommandModule, CliIo } from "@hypit/cli/public";
import { findProjectRoot } from "@hypit/project/node";

type JsonObject = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): JsonObject {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as JsonObject;
}

function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, (error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  });
}

function defaultPackageName(directory: string): string {
  const normalized = basename(directory).normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^[._-]+|[._-]+$/gu, "");
  return normalized.length === 0 ? "hypit-video" : normalized;
}

function packageName(value: string): string {
  assert(value.length > 0 && value.length <= 214 && !value.startsWith(".") && !value.startsWith("_"),
    "--name must be a non-empty npm package name");
  assert(/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(value),
    "--name must use lowercase npm package-name spelling");
  return value;
}

function markProject(manifest: JsonObject): JsonObject {
  const current = manifest.hypit === undefined ? {} : object(manifest.hypit, "package.json.hypit");
  return { ...manifest, hypit: { ...current, project: true } };
}

export type ProjectInitResult = {
  readonly root: string;
  readonly packageFile: string;
  readonly gitignoreFile: string;
  readonly packageCreated: boolean;
  readonly packageChanged: boolean;
  readonly gitignoreCreated: boolean;
};

/** Mark one ordinary npm package as a Hypit production without inventing subsystem files. */
export async function initializeHypitProject(input: {
  readonly directory: string;
  readonly name?: string;
}): Promise<ProjectInitResult> {
  await mkdir(resolve(input.directory), { recursive: true });
  const root = await realpath(resolve(input.directory));
  const packageFile = join(root, "package.json");
  const gitignoreFile = join(root, ".gitignore");
  const packageCreated = !await exists(packageFile);
  let packageChanged = packageCreated;
  let manifest: JsonObject;
  if (packageCreated) {
    manifest = {
      name: packageName(input.name ?? defaultPackageName(root)),
      version: "0.0.0",
      private: true,
      type: "module",
      hypit: { project: true },
    };
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(packageFile, "utf8")) as unknown;
    } catch (error) {
      throw new Error(`Project manifest ${packageFile} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    manifest = object(parsed, packageFile);
    const currentHypit = manifest.hypit === undefined ? undefined : object(manifest.hypit, `${packageFile}.hypit`);
    packageChanged = currentHypit?.project !== true;
    if (input.name !== undefined) {
      assert(manifest.name === input.name,
        `Existing package ${packageFile} is named ${String(manifest.name)}; --name cannot rename it`);
    }
    if (packageChanged) manifest = markProject(manifest);
  }
  if (packageChanged) {
    await writeFile(packageFile, `${JSON.stringify(manifest, undefined, 2)}\n`, {
      encoding: "utf8",
      ...(packageCreated ? { flag: "wx" } : {}),
    });
  }

  const gitignoreCreated = !await exists(gitignoreFile);
  if (gitignoreCreated) {
    await writeFile(gitignoreFile, "node_modules/\n.hypit/\nexports/\n", { encoding: "utf8", flag: "wx" });
  }
  return { root, packageFile, gitignoreFile, packageCreated, packageChanged, gitignoreCreated };
}

export function writeProjectHelp(io: Pick<CliIo, "write">): void {
  io.write("Usage: hypit project init [directory] [--name <package-name>] [--json]\n\n"
    + "Mark one ordinary npm package as one Hypit production.\n"
    + "This creates or updates package.json and creates .gitignore only when absent.\n"
    + "Graph, Canvas, Media Asset, NLE, Runtime and component files remain independently owned.\n");
}

async function runProjectCli(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  if (argv[1] === undefined || argv[1] === "help" || argv.includes("--help")) {
    writeProjectHelp(io);
    return;
  }
  assert(argv[1] === "init", `Unknown project command ${argv[1]}`);
  const positionals: string[] = [];
  let name: string | undefined;
  let json = false;
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (value === "--json") { json = true; continue; }
    if (["--debug", "--verbose", "--no-color"].includes(value)) continue;
    if (value === "--color") { index += 1; continue; }
    if (value === "--name") {
      assert(name === undefined, "--name cannot be repeated");
      const selected = argv[++index];
      assert(selected !== undefined && !selected.startsWith("--"), "--name requires a package name");
      name = packageName(selected);
      continue;
    }
    assert(!value.startsWith("--"), `Unknown option ${value}`);
    positionals.push(value);
  }
  assert(positionals.length <= 1, "project init accepts at most one directory");
  const result = await initializeHypitProject({
    directory: resolve(cwd, positionals[0] ?? "."),
    ...(name === undefined ? {} : { name }),
  });
  const discovered = await findProjectRoot({ cwd: result.root });
  assert(discovered === result.root, `Initialized project resolves as ${discovered ?? "nothing"}, expected ${result.root}`);
  if (json) {
    io.write(`${JSON.stringify({ format: "hypit.project-init@1", ok: true, ...result })}\n`);
    return;
  }
  io.write(`${result.packageCreated ? "Created" : result.packageChanged ? "Marked" : "Project already marked"}: ${result.root}\n`
    + `${result.gitignoreCreated ? "Created" : "Kept"}: ${result.gitignoreFile}\n`);
}

export function createProjectCliCommandModules(): readonly CliCommandModule[] {
  return [{
    id: "@hypit/project-cli",
    commands: ["project"],
    writeRootHelp(io) {
      io.write("\nProject\n  project init [directory]      mark one production root\n");
    },
    writeHelp(_argv, io) { writeProjectHelp(io); },
    async run(argv, io, context) { await runProjectCli(argv, io, context.cwd); },
  }];
}
