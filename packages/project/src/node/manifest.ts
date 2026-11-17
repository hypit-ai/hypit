import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseProjectManifest, type ProjectManifest } from "../index.js";

export async function readNodeProjectManifest(root: string): Promise<ProjectManifest> {
  return parseProjectManifest(await readFile(resolve(root, "hypit.project.json"), "utf8"));
}
