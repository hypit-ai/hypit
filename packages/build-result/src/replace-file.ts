import { rename } from "node:fs/promises";

/** Publish a complete file without changing the bytes held by existing readers. */
export async function replaceFile(from: string, to: string): Promise<void> {
  if (process.platform === "win32") {
    const { replaceWindowsFile } = await import("./replace-file-windows.js");
    replaceWindowsFile(from, to);
  } else {
    await rename(from, to);
  }
}
