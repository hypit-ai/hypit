#!/usr/bin/env node
import { renderCliError, writeCliHelp } from "@narratage/cli";
import type { CliIo } from "@narratage/cli";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const debug = argv.includes("--debug");
const colorIndex = argv.indexOf("--color");
const colorMode = argv.includes("--no-color")
  ? "never"
  : colorIndex >= 0 ? argv[colorIndex + 1] : "auto";
const color = !json && colorMode !== "never" && process.env.TERM !== "dumb"
  && (colorMode === "always" || (process.env.NO_COLOR === undefined && process.stdout.isTTY === true));
const unicode = process.env.TERM !== "dumb";

async function readSecret(prompt: string): Promise<string> {
  if (process.stdin.isTTY !== true || typeof process.stdin.setRawMode !== "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  }
  process.stderr.write(prompt);
  return await new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = (error?: Error): void => {
      process.stdin.off("data", input);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write("\n");
      if (error === undefined) resolve(value);
      else reject(error);
    };
    const input = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (byte === 3) { finish(new Error("credential input cancelled")); return; }
        if (byte === 10 || byte === 13) { finish(); return; }
        if (byte === 8 || byte === 127) { value = value.slice(0, -1); continue; }
        value += String.fromCharCode(byte);
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", input);
  });
}

const io: CliIo = {
  write: (text) => process.stdout.write(text),
  setExitCode: (code) => { process.exitCode = code; },
  readSecret,
  terminal: {
    isTTY: process.stdout.isTTY === true,
    color,
    unicode,
    columns: process.stdout.columns ?? 100,
  },
};

async function main(): Promise<void> {
  if (argv.length === 0 || argv[0] === "help" || argv.includes("--help")) {
    writeCliHelp(io);
    return;
  }
  const { runVideoCli } = await import("./index.js");
  await runVideoCli(argv, io);
}

main().catch((error: unknown) => {
  const rendered = renderCliError(error, {
    json,
    color: !json && colorMode !== "never" && process.env.TERM !== "dumb"
      && (colorMode === "always" || (process.env.NO_COLOR === undefined && process.stderr.isTTY === true)),
    unicode,
    debug,
  });
  (json ? process.stdout : process.stderr).write(rendered);
  process.exitCode = 1;
});
