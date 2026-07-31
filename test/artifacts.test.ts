import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkSource, compileSource } from "../src/compiler.js";
import { sha256 } from "../src/util.js";

const fixture = fileURLToPath(new URL("./fixtures/artifacts/", import.meta.url));
const pinnedImage = fileURLToPath(
  new URL("./fixtures/collision/left/image.png", import.meta.url),
);
const alternateImage = fileURLToPath(
  new URL("./fixtures/collision/right/image.png", import.meta.url),
);

test("capability instances require exact verified artifacts and never invoke a provider", async () => {
  const file = `${fixture}/main.svml`;
  const checked = await checkSource(file);
  const capability = checked.plan.instances.find((instance) => instance.id === "poster");
  assert.equal(
    checked.plan.kernels.find((kernel) => kernel.name === "pinned-image")?.profile,
    "capability-v1",
  );
  await assert.rejects(
    compileSource({
      file,
      evidenceFile: `${fixture}/alignment.json`,
    }),
    /artifact_file_required/u,
  );

  const directory = await mkdtemp(join(tmpdir(), "svml-artifacts-"));
  const lock = join(directory, "svml.lock");
  const artifacts = join(directory, "artifacts.json");
  const output = join(directory, "index.html");
  await writeFile(lock, `${JSON.stringify(checked.lock, null, 2)}\n`, "utf8");
  await writeFile(artifacts, `${JSON.stringify({
    contract: "svml.artifacts.v1",
    bindings: [{
      instanceIdentity: capability?.identity,
      executionDigest: capability?.executionDigest,
      outputs: {
        image: {
          type: "Image",
          uri: pathToFileURL(pinnedImage).href,
          contentDigest: sha256(await readFile(pinnedImage)),
        },
      },
    }],
  }, null, 2)}\n`, "utf8");

  const compilation = await compileSource({
    file,
    evidenceFile: `${fixture}/alignment.json`,
    lockFile: lock,
    artifactsFile: artifacts,
    outputFile: output,
  });
  assert.equal(compilation.artifactsVerified, true);
  assert.equal(compilation.reproducible, true);
  assert.match(compilation.html, /bound-image/u);
  assert.match(compilation.html, /\.\/assets\/[a-f0-9]{16}-image\.png/u);

  const alternateArtifacts = join(directory, "alternate-artifacts.json");
  await writeFile(alternateArtifacts, `${JSON.stringify({
    contract: "svml.artifacts.v1",
    bindings: [{
      instanceIdentity: capability?.identity,
      executionDigest: capability?.executionDigest,
      outputs: {
        image: {
          type: "Image",
          uri: pathToFileURL(alternateImage).href,
          contentDigest: sha256(await readFile(alternateImage)),
        },
      },
    }],
  }, null, 2)}\n`, "utf8");
  const alternate = await compileSource({
    file,
    evidenceFile: `${fixture}/alignment.json`,
    lockFile: lock,
    artifactsFile: alternateArtifacts,
  });
  assert.equal(
    compilation.plan.instances.find((instance) => instance.id === "poster")?.executionDigest,
    alternate.plan.instances.find((instance) => instance.id === "poster")?.executionDigest,
  );
  assert.notEqual(
    compilation.plan.instances.find((instance) => instance.id === "film")?.executionDigest,
    alternate.plan.instances.find((instance) => instance.id === "film")?.executionDigest,
  );
});
