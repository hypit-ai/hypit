import test from "node:test";
import assert from "node:assert/strict";
import { browserDownloadBaseUrl, browserExecutablePath } from "../src/browser.js";

test("download source accepts an archive base and rejects ignored or malformed configuration", () => {
  assert.equal(browserDownloadBaseUrl({ browserDownloadBaseUrl: "https://mirror.example/chrome///" }), "https://mirror.example/chrome");
  for (const value of ["", "mirror.example", "file:///tmp/browser", "https://mirror.example/?token=1", "https://mirror.example/#archive", "https://user:secret@mirror.example"]) {
    assert.throws(() => browserExecutablePath({ browserDownloadBaseUrl: value }), /browserDownloadBaseUrl/u);
  }
  assert.throws(() => browserExecutablePath({ chromePath: process.execPath, browserDownloadBaseUrl: "https://mirror.example" }), /mutually exclusive/u);
  assert.equal(browserExecutablePath({ browserDownloadBaseUrl: "https://mirror.example" }), browserExecutablePath({}), "source changes must not change the selected executable");
});
