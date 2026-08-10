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

const io: CliIo = {
  write: (text) => process.stdout.write(text),
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
