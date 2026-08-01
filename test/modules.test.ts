import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSource, compileSource } from "../src/compiler.js";
import { SvmlError } from "../src/diagnostics.js";
import { portableFileIdentity } from "../src/util.js";

const fixtures = fileURLToPath(new URL("./fixtures/modules/", import.meta.url));

test(".svc content DAG and .svs parameter classes bind into one source closure", async () => {
  const file = `${fixtures}/main.svml`;
  const checked = await checkSource(file);

  assert.deepEqual(
    checked.plan.instances.map((instance) => instance.id).sort(),
    ["brand.poster", "broll", "caption-plan", "captions", "location", "main-film", "speech"],
  );
  assert.deepEqual(
    checked.plan.values.map((value) => value.id).sort(),
    ["avatar", "brand.logo", "timing", "voice-audio"],
  );
  const logo = checked.plan.values.find((value) => value.id === "brand.logo");
  assert.equal(logo?.localId, "logo");
  assert.match(logo?.module ?? "", /brand\.svc$/u);
  assert.ok(!checked.plan.values.some((value) => value.id === "brand.tagline"));

  const captions = checked.plan.instances.find((instance) => instance.id === "captions");
  assert.equal(captions?.attributes.z, 510);
  assert.equal(captions?.attributes.size, 48);
  assert.equal(captions?.attributes.color, "#fefefe");
  assert.deepEqual(
    captions?.effectiveParameters.size?.sources.map((source) => source.kind),
    ["kernel-default", "svs-class", "instance"],
  );

  const film = checked.plan.instances.find((instance) => instance.id === "main-film");
  assert.equal(film?.attributes.background, "#112233");
  assert.equal(film?.attributes.fps, 30);

  const compilation = await compileSource({
    file,
  });
  assert.match(compilation.html, /data-composition-id="main-film"/u);
  assert.match(compilation.html, /#112233/u);
  assert.match(compilation.html, /logo\.png/u);
});

test("import aliases do not change imported instance identity or execution digest", async () => {
  const original = await checkSource(`${fixtures}/main.svml`);
  const renamed = await checkSource(`${fixtures}/main-renamed-alias.svml`);
  const before = original.plan.instances.find((instance) => instance.localId === "poster");
  const after = renamed.plan.instances.find((instance) => instance.localId === "poster");

  assert.equal(before?.identity, after?.identity);
  assert.equal(before?.executionDigest, after?.executionDigest);
});

test("svml.lock verifies the exact source closure and Kernel implementations", async () => {
  const file = `${fixtures}/main.svml`;
  const checked = await checkSource(file);
  assert.ok(checked.lock.modules.every((module) => module.uri.startsWith("svml-file:")));
  assert.ok(checked.lock.kernels.every((kernel) =>
    kernel.manifestUri.startsWith("svml-file:")
    && (kernel.implementationUri?.startsWith("svml-file:") ?? true)));
  assert.ok(checked.lock.materials
    .filter((material) => material.uri?.startsWith("svml-file:"))
    .every((material) => !material.uri?.includes(process.cwd())));
  const directory = await mkdtemp(join(tmpdir(), "svml-lock-"));
  const lock = join(directory, "svml.lock");
  await writeFile(lock, `${JSON.stringify(checked.lock, null, 2)}\n`, "utf8");

  const verified = await compileSource({
    file,
    lockFile: lock,
  });
  assert.equal(verified.sourceClosureVerified, true);
  assert.equal(verified.lockVerified, false);
  await writeFile(lock, `${JSON.stringify(verified.lock, null, 2)}\n`, "utf8");
  const frozen = await compileSource({ file, lockFile: lock });
  assert.equal(frozen.lockVerified, true);
  assert.equal(frozen.lock.execution?.htmlDigest.length, 64);

  const changed = structuredClone(checked.lock);
  changed.kernels[0]!.implementationHash = "0".repeat(64);
  await writeFile(lock, `${JSON.stringify(changed, null, 2)}\n`, "utf8");
  await assert.rejects(
    compileSource({
      file,
      lockFile: lock,
    }),
    (error: unknown) =>
      error instanceof SvmlError
      && error.diagnostics.some((diagnostic) => diagnostic.code === "lock_mismatch"),
  );
});

test("portable file identity survives relocating the complete source closure", () => {
  assert.equal(
    portableFileIdentity("/checkout-a/project/main.svml", "/checkout-a/project/content/brand.svc"),
    portableFileIdentity("/checkout-b/project/main.svml", "/checkout-b/project/content/brand.svc"),
  );
});

test("asset staging uses content-addressed names and never overwrites equal basenames", async () => {
  const collision = fileURLToPath(new URL("./fixtures/collision/", import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), "svml-assets-"));
  const output = join(directory, "index.html");
  await mkdir(directory, { recursive: true });
  await compileSource({
    file: `${collision}/main.svml`,
    outputFile: output,
  });

  const assets = await readdir(join(directory, "assets"));
  const images = assets.filter((name) => name.endsWith("-image.png"));
  assert.equal(images.length, 2);
  assert.notEqual(images[0], images[1]);
  const html = await readFile(output, "utf8");
  for (const image of images) assert.match(html, new RegExp(image, "u"));
});
