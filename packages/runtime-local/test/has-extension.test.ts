import assert from "node:assert/strict";
import test from "node:test";
import { hasExtension } from "../src/node.js";

// Expected values are what the replaced check `/\.[^\\/]+$/u.test(value)` returned for each input.

test("hasExtension matches the extension check it replaced", () => {
  const cases: Array<[string, boolean]> = [
    ["a.exe", true],
    ["a.", false],
    [".a", true],
    ["a/.b", true],
    ["a\\b.", false],
    ["dir.d/file", false],
    ["dir.d\\file", false],
    ["file", false],
    ["", false],
    ["..", true],
    ["a.b.", true],
    ["/x/.bashrc", true],
    ["C:\\tools\\node.cmd", true],
  ];
  for (const [value, expected] of cases) {
    assert.equal(hasExtension(value), expected, `hasExtension(${JSON.stringify(value)})`);
  }
});

test("hasExtension stays linear on long runs of dots", () => {
  const value = `${".".repeat(200_000)}/`;
  const started = performance.now();
  assert.equal(hasExtension(value), false);
  assert.ok(performance.now() - started < 100, "hasExtension took too long on a pathological input");
});
