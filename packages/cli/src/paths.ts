import { resolve } from "node:path";

export { hypitHostStateRoot } from "@hypit/runtime-host-node";

export function hypitProjectStateRoot(projectRoot: string): string {
  return resolve(projectRoot, ".hypit");
}
