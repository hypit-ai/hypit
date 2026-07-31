import { copyFile, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/src/", import.meta.url), { recursive: true });
await copyFile(
  new URL("../src/sandbox-worker.mjs", import.meta.url),
  new URL("../dist/src/sandbox-worker.mjs", import.meta.url),
);
