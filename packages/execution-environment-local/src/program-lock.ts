import { closeSync, openSync } from "node:fs";
import { constants } from "node:os";
import { join, toNamespacedPath } from "node:path";
import koffi from "koffi";

// The OS owns exclusion and releases it when the calling process exits. The empty file
// is only an address: never unlink it, infer a phase from it, or expire another owner's lock.
const library = koffi.load(process.platform === "win32" ? "kernel32.dll" : null);
const flock = process.platform === "win32" ? undefined : library.func("int flock(int fd, int operation)");
const createFile = process.platform === "win32"
  ? library.func("intptr_t __stdcall CreateFileW(const char16_t *path, uint32_t access, uint32_t share, void *security, uint32_t disposition, uint32_t attributes, intptr_t templateFile)") : undefined;
const lastError = process.platform === "win32" ? library.func("uint32_t __stdcall GetLastError()") : undefined;
const closeHandle = process.platform === "win32" ? library.func("int __stdcall CloseHandle(intptr_t file)") : undefined;

/** Try once. An occupied program returns immediately; unrelated programs remain independent. */
export function tryProgramLock(directory: string): (() => void) | undefined {
  const path = join(directory, "lifecycle.lock");
  let close: () => void;
  if (createFile !== undefined) {
    // OPEN_ALWAYS, no sharing: exclusive while the handle is open, including across CLI processes.
    const handle = createFile(toNamespacedPath(path), 0xc0000000, 0, null, 4, 0x80, 0);
    if (handle === -1 || handle === -1n) {
      const code = lastError!();
      if (code === 32 || code === 33) return undefined;
      throw new Error(`Cannot acquire Program ownership at ${path}: Windows error ${code}`);
    }
    close = () => { closeHandle!(handle); };
  } else {
    const fd = openSync(path, "a");
    if (flock!(fd, 2 | 4) !== 0) { // LOCK_EX | LOCK_NB
      const code = koffi.errno();
      closeSync(fd);
      if (code === constants.errno.EAGAIN || code === constants.errno.EWOULDBLOCK) return undefined;
      throw new Error(`Cannot acquire Program ownership at ${path}: errno ${code}`);
    }
    close = () => { closeSync(fd); };
  }
  let released = false;
  return () => { if (!released) { released = true; close(); } };
}
