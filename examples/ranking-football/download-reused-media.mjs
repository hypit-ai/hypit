import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Run from the variant directory that will consume these existing performances.
const destination = resolve("reused");
const base = "https://storage.googleapis.com/hypit-public-assets/examples/ranking-football/2026-09-10/";
await mkdir(destination, { recursive: true });

for (const name of ["messi.mp4", "ronaldo.mp4"]) {
  const response = await fetch(new URL(name, base));
  if (!response.ok) throw new Error(`Download ${name}: HTTP ${response.status}`);
  const file = resolve(destination, name);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
  console.log(`Downloaded ${file}`);
}
