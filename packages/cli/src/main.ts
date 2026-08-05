import { resolve } from "node:path";

import { createOfficialNodeCompiler } from "./host.js";

type CliIo = {
  readonly write: (text: string) => void;
};

type ParsedArgs = {
  readonly command: string | undefined;
  readonly file: string | undefined;
  readonly root: string | undefined;
  readonly targets: readonly string[];
  readonly substitute: boolean;
};

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, file, ...rest] = argv;
  const targets: string[] = [];
  let root: string | undefined;
  let substitute = false;
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item === "--target") {
      const target = rest[index + 1];
      if (target === undefined || target.startsWith("--")) throw new Error("--target requires an export name");
      targets.push(target);
      index += 1;
      continue;
    }
    if (item === "--root") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--root requires a directory");
      root = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--accept-substitute") {
      substitute = true;
      continue;
    }
    throw new Error(`unknown option ${item}`);
  }
  return { command, file, root, targets, substitute };
}

function usage(): string {
  return [
    "usage:",
    "  svml-v2 check <file.svml> [--root directory]",
    "  svml-v2 plan <file.svml> --target export [--target export] [--accept-substitute] [--root directory]",
  ].join("\n");
}

export async function runCli(argv: readonly string[], io: CliIo): Promise<void> {
  const args = parseArgs(argv);
  if (args.file === undefined || (args.command !== "check" && args.command !== "plan")) {
    throw new Error(usage());
  }
  const compiler = createOfficialNodeCompiler({ ...(args.root === undefined ? {} : { root: args.root }) });
  if (args.command === "check") {
    const result = await compiler.compileFile(args.file);
    io.write(`${JSON.stringify({
      ok: true,
      sourceClosure: result.closure.id,
      moduleClosure: result.program.closure.digest,
      graph: result.elaboration.graph.id,
      units: result.closure.units.length,
      modules: result.program.closure.modules.map((item) => `${item.ref.name}@${item.ref.version}`),
      exports: result.exports.map((item) => ({ name: item.name, type: item.type, kind: item.ref.kind })),
    }, null, 2)}\n`);
    return;
  }
  const result = await compiler.planFile(args.file, {
    targets: args.targets,
    accepts: args.substitute ? "substitute" : "exact",
  });
  io.write(`${JSON.stringify(result.plan, null, 2)}\n`);
}
