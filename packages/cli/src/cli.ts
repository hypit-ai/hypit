#!/usr/bin/env node
import { runCli } from "./main.js";

runCli(process.argv.slice(2), { write: (text) => process.stdout.write(text) }).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
