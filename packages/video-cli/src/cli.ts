#!/usr/bin/env node
import { runVideoCli } from "./index.js";

runVideoCli(process.argv.slice(2), { write: (text) => process.stdout.write(text) }).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
