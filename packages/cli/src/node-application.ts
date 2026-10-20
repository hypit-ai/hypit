import { runCliApplication } from "./application.js";
import type { CliApplication } from "./application.js";
import { renderCliError } from "./output.js";
import type { CliIo } from "./output.js";
import { acceptSecretBytes } from "./secret-input.js";
import { parseCliGlobalOptions } from "./global-options.js";

export type NodeCliRunner = (argv: readonly string[], io: CliIo) => void | Promise<void>;

async function readSecret(prompt: string): Promise<string> {
  if (process.stdin.isTTY !== true || typeof process.stdin.setRawMode !== "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  }
  process.stderr.write(prompt);
  return await new Promise<string>((resolve, reject) => {
    const raw: number[] = [];
    const finish = (error?: Error): void => {
      process.stdin.off("data", input);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write("\n");
      if (error === undefined) resolve(Buffer.from(raw).toString("utf8"));
      else reject(error);
    };
    const input = (chunk: Buffer): void => {
      const result = acceptSecretBytes(raw, chunk);
      if (result === "cancelled") finish(new Error("credential input cancelled"));
      if (result === "done") finish();
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", input);
  });
}

/** Node terminal adapter shared by every assembled CLI application. */
export async function runNodeCli(
  argv: readonly string[],
  run: NodeCliRunner,
): Promise<void> {
  const global = parseCliGlobalOptions(argv);
  const json = global.presentation.json;
  const debug = global.debug;
  const colorMode = global.presentation.color;
  const color = !json && colorMode !== "never" && process.env.TERM !== "dumb"
    && (colorMode === "always" || (process.env.NO_COLOR === undefined && process.stdout.isTTY === true));
  const unicode = process.env.TERM !== "dumb";
  const io: CliIo = {
    write: (text) => process.stdout.write(text),
    writeProgress: (text) => process.stderr.write(text),
    setExitCode: (code) => { process.exitCode = code; },
    readSecret,
    terminal: {
      isTTY: process.stdout.isTTY === true,
      color,
      unicode,
      columns: process.stdout.columns ?? 100,
    },
  };
  try {
    if (global.issue !== undefined) throw new Error(global.issue);
    await run(argv, io);
  } catch (error) {
    const rendered = renderCliError(error, {
      json,
      jsonl: global.presentation.jsonl === true,
      color: !json && colorMode !== "never" && process.env.TERM !== "dumb"
        && (colorMode === "always" || (process.env.NO_COLOR === undefined && process.stderr.isTTY === true)),
      unicode,
      debug,
    });
    (json ? process.stdout : process.stderr).write(rendered);
    process.exitCode = 1;
  }
}

/** Convenience entry for an already assembled application. */
export async function runNodeCliApplication(
  argv: readonly string[],
  application: CliApplication,
): Promise<void> {
  await runNodeCli(argv, async (args, io) => await runCliApplication(args, io, application));
}
