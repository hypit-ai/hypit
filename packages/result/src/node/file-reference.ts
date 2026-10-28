import type { BuildResultFileRef } from "../types.js";

export function fileReferenceIdentity(owner: string, file: BuildResultFileRef): string {
  return JSON.stringify(["result", owner, file.path]);
}
