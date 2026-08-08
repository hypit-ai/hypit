import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Source files must stay text.
 *
 * A raw control byte in a string literal works at runtime and reads as an
 * ordinary separator in an editor, so it survives review — but git then treats
 * the file as binary and stops producing diffs or merging it at all. Writing
 * the escape sequence instead costs nothing and keeps the file reviewable.
 */

const root = fileURLToPath(new URL("..", import.meta.url));

function tracked() {
  return execFileSync(
    "git",
    ["ls-files", "-c", "-o", "--exclude-standard", "tools/playground", "test"],
    { cwd: root, encoding: "utf8" },
  ).trim().split("\n").filter((path) => /\.(?:ts|mjs|js|html|css|json)$/u.test(path));
}

test("no playground source carries a raw control byte", () => {
  const offenders = [];
  for (const path of tracked()) {
    const bytes = readFileSync(new URL(path, new URL("..", import.meta.url)));
    for (const [index, byte] of bytes.entries()) {
      // Tab, newline and carriage return are the only control bytes text needs.
      if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
        offenders.push(`${path}: byte 0x${byte.toString(16).padStart(2, "0")} at offset ${index}`);
        break;
      }
    }
  }
  assert.deepEqual(offenders, [], `write the escape sequence instead:\n${offenders.join("\n")}`);
});
