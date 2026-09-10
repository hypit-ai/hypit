import { toNamespacedPath } from "node:path";
import koffi from "koffi";

const kernel = koffi.load("kernel32.dll");
const createFile = kernel.func("intptr_t __stdcall CreateFileW(const char16_t *path, uint32_t access, uint32_t share, void *security, uint32_t disposition, uint32_t attributes, intptr_t templateFile)");
const setInformation = kernel.func("int __stdcall SetFileInformationByHandle(intptr_t file, int infoClass, void *info, uint32_t size)");
const closeHandle = kernel.func("int __stdcall CloseHandle(intptr_t file)");
const getLastError = kernel.func("uint32_t __stdcall GetLastError()");

const renameInfo = koffi.struct({
  Flags: "uint32_t",
  RootDirectory: "void *",
  FileNameLength: "uint32_t",
  FileName: koffi.array("uint16_t", 1),
});

const DELETE = 0x00010000;
const SHARE_READ_WRITE_DELETE = 0x7;
const OPEN_EXISTING = 3;
const FILE_ATTRIBUTE_NORMAL = 0x80;
const FileRenameInfoEx = 22;
const REPLACE_IF_EXISTS = 0x1;
const POSIX_SEMANTICS = 0x2;

function failure(syscall: string, from: string, to: string): Error {
  const win32Code = getLastError() as number;
  return Object.assign(new Error(`Windows file replacement failed (${win32Code}): '${from}' -> '${to}'`), {
    code: `WIN32_${win32Code}`, win32Code, syscall, path: from, dest: to,
  });
}

/**
 * FileRenameInfoEx preserves open readers of the old file while publishing the new name.
 * Node's Windows rename uses MoveFileExW, whose replacement semantics differ here.
 * https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-fscc/4217551b-d2c0-42cb-9dc1-69a716cf6d0c
 */
export function replaceWindowsFile(from: string, to: string): void {
  const filename = Buffer.from(toNamespacedPath(to), "utf16le");
  const nameOffset = koffi.offsetof(renameInfo, "FileName");
  const info = Buffer.alloc(Math.max(koffi.sizeof(renameInfo), nameOffset + filename.length));
  info.writeUInt32LE(REPLACE_IF_EXISTS | POSIX_SEMANTICS, koffi.offsetof(renameInfo, "Flags"));
  info.writeUInt32LE(filename.length, koffi.offsetof(renameInfo, "FileNameLength"));
  filename.copy(info, nameOffset);

  const handle = createFile(toNamespacedPath(from), DELETE, SHARE_READ_WRITE_DELETE,
    null, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, 0) as number | bigint;
  if (handle === -1 || handle === -1n) throw failure("CreateFileW", from, to);
  try {
    if (!setInformation(handle, FileRenameInfoEx, info, info.length)) {
      throw failure("SetFileInformationByHandle", from, to);
    }
  } finally {
    closeHandle(handle);
  }
}
