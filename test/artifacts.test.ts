import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkSource, compileSource } from "../src/compiler.js";
import { sha256, stableJson } from "../src/util.js";

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
    lockFile: lock,
    artifactsFile: artifacts,
    outputFile: output,
  });
  assert.equal(compilation.artifactsVerified, true);
  assert.equal(compilation.sourceClosureVerified, true);
  assert.equal(compilation.temporalEvidenceVerified, false);
  assert.equal(compilation.reproducible, false);
  assert.match(compilation.html, /bound-image/u);
  assert.match(compilation.html, /\.\/assets\/[a-f0-9]{16}-image\.png/u);

  await writeFile(lock, `${JSON.stringify(compilation.lock, null, 2)}\n`, "utf8");
  const frozen = await compileSource({
    file,
    lockFile: lock,
    artifactsFile: artifacts,
  });
  assert.equal(frozen.lockVerified, true);
  assert.equal(frozen.temporalEvidenceVerified, true);
  assert.equal(frozen.reproducible, true);

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

test("a Locator capability returns ExactSemanticMap through the same typed Artifact ABI", async () => {
  const source = fileURLToPath(
    new URL("../examples/composite-speech-program/minimal.svml", import.meta.url),
  );
  const reference = await compileSource({ file: source });
  const directory = await mkdtemp(join(tmpdir(), "svml-locator-artifact-"));
  const svml = join(directory, "main.svml");
  const assemble = fileURLToPath(new URL("../stdlib/speech-assemble.svk", import.meta.url));
  const film = fileURLToPath(new URL("../stdlib/film.svk", import.meta.url));
  const locator = fileURLToPath(
    new URL("./fixtures/artifacts/pinned-locator.svk", import.meta.url),
  );
  const avatar = fileURLToPath(
    new URL("../examples/regen-ranking/assets/avatar-1.mp4", import.meta.url),
  );
  const audio = fileURLToPath(
    new URL("../examples/regen-ranking/assets/avatar-1.mp3", import.meta.url),
  );
  const evidence = fileURLToPath(
    new URL("../examples/composite-speech-program/alignment.json", import.meta.url),
  );
  await writeFile(svml, `<svml version="1">
  <import from="${assemble}"/>
  <import from="${locator}"/>
  <import from="${film}"/>
  <script>
    <segment id="intro"><HOST> Hello, this is SVML.</segment>
    <segment id="close"><HOST> Write the script, get the video.</segment>
  </script>
  <video id="host" src="${avatar}"/>
  <audio id="host-audio" src="${audio}"/>
  <alignment id="alignment" src="${evidence}"/>
  <speech-assemble id="voice" fps="30" defaultJoin="cut">
    <segment id="intro" script={script.segment.intro} visual={host} audio={host-audio} sourceWindow="0s .. 5s"/>
    <segment id="close" script={script.segment.close} visual={host} audio={host-audio} sourceWindow="5s .. 10s"/>
    <join after="intro" overlap="500ms" audio="crossfade" visual="dissolve"/>
  </speech-assemble>
  <pinned-locator id="location" script={script} basis={voice.production} evidence={alignment}/>
  <film id="film" basis={voice.production} semantic={location.map}/>
</svml>\n`, "utf8");
  const checked = await checkSource(svml);
  const instance = checked.plan.instances.find((item) => item.id === "location");
  const artifacts = join(directory, "artifacts.json");
  await writeFile(artifacts, `${JSON.stringify({
    contract: "svml.artifacts.v1",
    bindings: [{
      instanceIdentity: instance?.identity,
      executionDigest: instance?.executionDigest,
      outputs: {
        map: {
          type: "ExactSemanticMap",
          value: reference.semanticMap,
          contentDigest: sha256(stableJson(reference.semanticMap)),
        },
      },
    }],
  }, null, 2)}\n`, "utf8");
  const compilation = await compileSource({ file: svml, artifactsFile: artifacts });
  assert.equal(compilation.semanticMap.mapDigest, reference.semanticMap.mapDigest);
  assert.equal(compilation.semanticMap.basisDigest, compilation.basis.basis.basisDigest);
});
