import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const paths = execFileSync("git", ["ls-files", "-c", "-o", "--exclude-standard", "tools/caption-playground", "test"], {
  cwd: root, encoding: "utf8",
}).trim().split("\n").filter((path) => /\.(?:ts|mjs|js|html|css|json)$/u.test(path));

test("Caption Playground source carries no raw control byte", () => {
  const offenders = [];
  for (const path of paths) {
    const file = new URL(path, new URL("..", import.meta.url));
    if (!existsSync(file)) continue;
    for (const [index, byte] of readFileSync(file).entries()) {
      if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
        offenders.push(`${path}: 0x${byte.toString(16)} at ${index}`);
        break;
      }
    }
  }
  assert.deepEqual(offenders, []);
});
