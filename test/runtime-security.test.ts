import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileSource } from "../src/compiler.js";
import { SvmlError } from "../src/diagnostics.js";
import { validateKernelProjection } from "../src/runtime-validation.js";

test("projector CSS is scoped and active HTML is rejected", () => {
  const projection = validateKernelProjection({
    outputs: {},
    visuals: [{
      id: "safe",
      kind: "html",
      html: '<div class="label">Hello</div>',
      css: ".label { color: red; }",
      startFrame: 0,
      endFrameExclusive: 1,
      z: 1,
    }],
  });
  assert.match(projection.visuals?.[0]?.css ?? "", /^\[data-svml-scope="[a-f0-9]+"\] \.label/u);
  assert.throws(
    () => validateKernelProjection({
      outputs: {},
      visuals: [{
        id: "active",
        kind: "html",
        html: "<script>document.body.remove()</script>",
        startFrame: 0,
        endFrameExclusive: 1,
        z: 1,
      }],
    }),
    (error: unknown) =>
      error instanceof SvmlError
      && error.diagnostics.some((diagnostic) => diagnostic.code === "kernel_html_capability"),
  );
});

test("isolated projector ABI rejects Node builtin imports", async () => {
  const fixture = fileURLToPath(new URL("./fixtures/unsafe/", import.meta.url));
  await assert.rejects(
    compileSource({
      file: `${fixture}/main.svml`,
      evidenceFile: `${fixture}/alignment.json`,
    }),
    (error: unknown) =>
      error instanceof SvmlError
      && error.diagnostics.some((diagnostic) => diagnostic.code === "kernel_projector_isolation"),
  );
});
