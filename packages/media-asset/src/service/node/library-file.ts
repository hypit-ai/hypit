import { createHash } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectMediaLibraryFile, ProjectMediaLibraryRevisionConflict } from "../library.js";
import type { ProjectMediaCollectionAdapter } from "../types.js";

const absent = "absent";
const revisionOf = (source: string) => createHash("sha256").update(source).digest("hex");

export function nodeMediaLibraryFile(directory: string): Pick<ProjectMediaCollectionAdapter, "readLibrary" | "writeLibrary"> {
  const path = join(directory, projectMediaLibraryFile);
  const readLibrary = async () => {
    try {
      const source = await readFile(path, "utf8");
      return { revision: revisionOf(source), source };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { revision: absent };
      throw error;
    }
  };
  return {
    readLibrary,
    async writeLibrary(source, expectedRevision) {
      await mkdir(directory, { recursive: true });
      const staging = await mkdtemp(join(directory, ".hypit-media-library-"));
      const temporary = join(staging, projectMediaLibraryFile);
      try {
        await writeFile(temporary, source, { encoding: "utf8", flag: "wx" });
        if ((await readLibrary()).revision !== expectedRevision) throw new ProjectMediaLibraryRevisionConflict();
        if (expectedRevision === absent) {
          await link(temporary, path).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "EEXIST") throw new ProjectMediaLibraryRevisionConflict();
            throw error;
          });
        } else {
          await rename(temporary, path);
        }
        return revisionOf(source);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    },
  };
}
