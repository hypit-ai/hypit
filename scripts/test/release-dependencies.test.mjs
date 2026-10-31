import assert from "node:assert/strict";
import test from "node:test";
import { releaseDependencyVersion } from "../release-dependencies.mjs";
import { selectReleasePackages, releaseCandidatePackages } from "../release-candidate.mjs";
import { distributionEmbeddedPackageDirectories } from "../distribution-ownership.mjs";
import { fileURLToPath } from "node:url";
import { cp, mkdtemp, rm } from "node:fs/promises";
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

test("default domain dependencies remain independent through the Video product", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const embedded = await distributionEmbeddedPackageDirectories(root);
  assert.equal(embedded.has("temporal"), false);
  assert.equal(embedded.has("narrative-temporal"), false);
  assert.equal(embedded.has("compiler"), true);
  const plan = await releaseCandidatePackages();
  const index = name => plan.independent.findIndex(item => item.name === `@hypit/${name}`);
  assert.ok(index("timeline") >= 0);
  assert.ok(index("timeline") < index("temporal"));
  assert.ok(index("temporal") < index("video"));
});

test("internal Core remains embedded instead of becoming an unversioned release dependency", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const embedded = await distributionEmbeddedPackageDirectories(root);
  for (const name of ["atomic-file", "endpoint", "facet", "kernel", "protocol", "result", "runtime"]) {
    assert.equal(embedded.has(name), true, `${name} must remain owned by the Distribution`);
  }
  const plan = await releaseCandidatePackages();
  assert.equal(plan.independent.some((item) => item.version === "0.0.0-dev"), false);
});
