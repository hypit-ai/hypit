#!/usr/bin/env node
import { renderCliError, writeCliHelp } from "@hypit/cli";
import type { CliIo } from "@hypit/cli";
import { creationCommands, isCreationCommand, writeCreationHelp } from "./creation.js";
import { isMediaCommand, mediaCommands, writeMediaHelp } from "./media.js";
import { writeVocabularyHelp } from "./vocabulary.js";

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
    const topic = argv[0] === "help" ? argv[1] : argv.includes("--help") ? argv[0] : undefined;
    if (isCreationCommand(topic)) {
      writeCreationHelp(io, topic);
      return;
    }
    if (topic === "media") {
      const sub = argv[0] === "help" ? argv[2] : argv[1];
      writeMediaHelp(io, isMediaCommand(sub) ? sub : undefined);
      return;
    }
    if (topic === "vocabulary") {
      writeVocabularyHelp(io);
      return;
    }
    writeCliHelp(io, topic);
    if (topic === undefined) {
      io.write(`\nCreation tools (one request through the selected Runtime Profile, no Build)\n${
        creationCommands.map((item) => `  ${item}`).join("\n")}\n  hypit help <tool> for each\n`
        + `\nPreparation (local, no request, no state)\n  media ${mediaCommands.join(" | ")}\n  vocabulary\n  hypit help media, hypit help vocabulary\n`);
    }
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
