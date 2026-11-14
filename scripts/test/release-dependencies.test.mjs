import assert from "node:assert/strict";
import test from "node:test";
import { releaseDependencyVersion } from "../release-dependencies.mjs";
import { selectReleasePackages, releaseCandidatePackages } from "../release-candidate.mjs";
import { distributionEmbeddedPackageDirectories } from "../distribution-ownership.mjs";
import { releasedPackageDependencyMap } from "../pack-independent-package.mjs";
import { fileURLToPath } from "node:url";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("release ranges preserve the author's compatibility minimum", () => {
  assert.equal(releaseDependencyVersion("script", "hypit", "workspace:^0.3.0"), "^0.3.0");
  assert.equal(releaseDependencyVersion("script", "caption", "workspace:0.0.0-dev"), "0.0.0-dev");
  assert.throws(() => releaseDependencyVersion("script", "hypit", "workspace:^"), /explicit compatibility/);
});

test("publication selection does not force a root or sibling release", () => {
  const plan = { independent: [{ name: "protocol" }, { name: "studio" }], distribution: { name: "root" } };
  assert.deepEqual(selectReleasePackages(plan, ["studio"]), [{ name: "studio" }]);
  assert.deepEqual(selectReleasePackages(plan, ["studio", "protocol"]), plan.independent);
  assert.throws(() => selectReleasePackages(plan, ["missing"]), /does not contain/);
});

test("publication selection loads without the build toolchain", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "hypit-release-selection-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(new URL("../release-candidate.mjs", import.meta.url), join(root, "release-candidate.mjs"));
  execFileSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { selectReleasePackages } from "./release-candidate.mjs";
    assert.deepEqual(selectReleasePackages({ independent: [], distribution: { name: "root" } }), [{ name: "root" }]);
  `], { cwd: root, stdio: "pipe" });
});

test("Toolchain keeps versioned capabilities independent and framework modules embedded", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const embedded = await distributionEmbeddedPackageDirectories(root);
  assert.equal(embedded.has("temporal"), false);
  assert.equal(embedded.has("narrative-temporal"), false);
  assert.equal(embedded.has("generation-authoring"), true);
  const toolchain = JSON.parse(await readFile(join(root, "packages/toolchain/package.json"), "utf8"));
  for (const name of Object.keys(toolchain.dependencies).filter((item) => item.startsWith("@hypit/"))) {
    const directory = name.slice("@hypit/".length);
    const dependency = JSON.parse(await readFile(join(root, "packages", directory, "package.json"), "utf8"));
    assert.equal(embedded.has(directory), dependency.version === "0.0.0-dev",
      `${name} ownership must follow its package version`);
  }
  const plan = await releaseCandidatePackages();
  const index = name => plan.independent.findIndex(item => item.name === `@hypit/${name}`);
  assert.ok(index("temporal") >= 0);
  assert.ok(index("temporal") < index("toolchain"));
});

test("internal framework packages remain embedded instead of becoming unversioned release dependencies", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const embedded = await distributionEmbeddedPackageDirectories(root);
  for (const name of [
    "atomic-file",
    "endpoint",
    "execution-environment",
    "facet",
    "generation-build",
    "generation-model",
    "generation-runtime",
    "protocol",
    "result",
  ]) {
    assert.equal(embedded.has(name), true, `${name} must remain owned by the Distribution`);
  }
  const plan = await releaseCandidatePackages();
  assert.equal(plan.independent.some((item) => item.version === "0.0.0-dev"), false);
});

test("independent packages bridge embedded framework modules through the Distribution peer", async () => {
  const dependencies = await releasedPackageDependencyMap("packages/toolchain", "dependencies");
  assert.equal(dependencies["@hypit/generation-authoring"], undefined);
  assert.equal(dependencies["@hypit/protocol"], undefined);
  assert.equal(dependencies["@hypit/svml"], undefined);
  const peers = await releasedPackageDependencyMap("packages/toolchain", "peerDependencies");
  assert.deepEqual(peers, { "@hypit/hypit": "^0.4.0" });

  const sourceApplication = await releasedPackageDependencyMap("packages/svml-toolchain", "dependencies");
  assert.equal(sourceApplication["@hypit/svml"], "^0.1.0");
  assert.equal(sourceApplication["@hypit/recipe"], "^0.1.0");
  assert.equal(sourceApplication["@hypit/media-author"], "^0.1.0");
  assert.equal(sourceApplication["@hypit/build-operations-cli"], "^0.1.0");
  assert.equal(sourceApplication["@hypit/toolchain"], undefined);
});
