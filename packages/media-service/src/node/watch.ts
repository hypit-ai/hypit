import { existsSync, watch, type FSWatcher } from "node:fs";
import { resolve } from "node:path";

export type ProjectMediaFileWatch = {
  close(): void;
};

export type ProjectMediaFileChange = {
  readonly kind: "change" | "rename" | "unknown";
  /** Portable path relative to the Project Boundary when the platform reports one. */
  readonly path?: string;
};

function portable(path: string): string {
  return path.split("\\").join("/");
}

/** Watch the narrow media namespace, falling back to the Project root only while media/ does not exist. */
export function watchProjectMediaFiles(
  projectRoot: string,
  changed: (change: ProjectMediaFileChange) => void,
): ProjectMediaFileWatch {
  const root = resolve(projectRoot);
  const media = resolve(root, "media");
  let watcher: FSWatcher | undefined;
  let reopenTimer: ReturnType<typeof setTimeout> | undefined;
  let watchingMedia = false;
  let closed = false;

  const open = (): void => {
    if (closed) return;
    watcher?.close();
    watchingMedia = existsSync(media);
    try {
      watcher = watch(watchingMedia ? media : root, { recursive: watchingMedia }, (event, filename) => {
        if (closed) return;
        if (!watchingMedia && filename !== null && filename.toString() !== "media") return;
        changed({
          kind: event,
          ...(filename === null ? {} : {
            path: watchingMedia ? `media/${portable(filename.toString())}` : "media",
          }),
        });
        if (existsSync(media) !== watchingMedia) queueMicrotask(open);
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && watchingMedia) {
        watchingMedia = false;
        watcher = watch(root, { recursive: false }, (event, filename) => {
          if (closed || (filename !== null && filename.toString() !== "media")) return;
          changed({ kind: event, path: "media" });
          if (existsSync(media)) queueMicrotask(open);
        });
      } else {
        throw error;
      }
    }
    watcher.on("error", () => {
      if (closed) return;
      watcher?.close();
      watcher = undefined;
      changed({ kind: "unknown" });
      if (reopenTimer !== undefined) return;
      reopenTimer = setTimeout(() => {
        reopenTimer = undefined;
        open();
      }, 250);
      reopenTimer.unref();
    });
    watcher.unref();
  };

  open();
  return {
    close() {
      if (closed) return;
      closed = true;
      if (reopenTimer !== undefined) clearTimeout(reopenTimer);
      reopenTimer = undefined;
      watcher?.close();
      watcher = undefined;
    },
  };
}
