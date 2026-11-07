import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createToolchainDistribution } from "@hypit/toolchain";
import { createToolchainCliCommandModules } from "@hypit/toolchain/cli";
import { createBuildCliCommandModules } from "@hypit/build-cli";
import { runCliApplication } from "@hypit/cli";
import { loadDiscoveredSourcePackages, runCli as runCommand } from "@hypit/build-cli";
import { installDistributionPackageResolution } from "@hypit/loader/node";

const toolchainDistribution = createToolchainDistribution();

const runCli = (
  argv: readonly string[],
  io: { readonly write: (text: string) => void },
) => {
  installDistributionPackageResolution(toolchainDistribution.packageRoot === undefined
    ? [] : [toolchainDistribution.packageRoot]);
  return runCliApplication([...argv, "--json"], io, {
    commandModules: [
      ...createBuildCliCommandModules(toolchainDistribution),
      ...createToolchainCliCommandModules(toolchainDistribution.packageRoot === undefined
        ? {}
        : { distributionPackageRoot: toolchainDistribution.packageRoot }),
    ],
  });
};

test("check compiles a data-only package Source export without a project copy", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-package-source-"));
  try {
    const kitRoot = join(root, "packages", "image-kits");
    await mkdir(join(kitRoot, "kits"), { recursive: true });
    await writeFile(join(kitRoot, "package.json"), JSON.stringify({
      name: "@acme/image-kits",
      version: "1.0.0",
      type: "module",
      exports: { "./ugc-v1": "./kits/ugc-v1.svml" },
    }), "utf8");
    await writeFile(join(kitRoot, "kits", "ugc-v1.svml"), `module prompt from "@hypit/prompt@1"

prompt.Template "ugc-v1" {
  slot "direction" { required: true }
}
`, "utf8");
    const source = join(root, "main.svml");
    await writeFile(source, `module prompt from "@hypit/prompt@1"
source kit from "@acme/image-kits/ugc-v1"

prompt.Render "prompt" {
  template: @kit.ugc-v1
  bind "direction" { value: "A useful photographed scene." }
}
`, "utf8");
    let output = "";
    await runCli(["check", source, "--project", root], {
      write: (text) => { output += text; },
    });
    const checked = JSON.parse(output) as { readonly sourceKind: string; readonly units: number };
    assert.equal(checked.sourceKind, "author");
    assert.equal(checked.units, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pricing sends complete requests to the Provider without copying parameters into its CLI view", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-pricing-"));
  try {
    const ids = Array.from({ length: 25 }, (_, index) => `portrait-${index}`);
    await writeFile(join(root, "main.svml"), `module prompt from "@hypit/prompt@1"
module gpt from "@hypit/gpt-image@1"

${ids.map((id) => `prompt.Prompt "${id}-prompt" { text: "An original ${id}." }
gpt.image {
  id: ${id}
  prompt: @${id}-prompt
  aspect-ratio: 9:16
  resolution: 2K
}`).join("\n\n")}
`);
    await writeFile(join(root, "runtime.json"), JSON.stringify(toolchainDistribution.initialRuntimeProfile));
    const source = join(root, "main.svml");
    let queried = 0;
    let output = "";
    await runCommand(["pricing", source, ...ids.flatMap((id) => ["--target", `${id}.image`]),
      "--project", root, "--runtime", join(root, "runtime.json"),
      "--json", "--limit", "1"], { write: (text) => { output += text; } }, {
      ...toolchainDistribution,
      openRuntimeHost: async (path, options) => ({
        ...await toolchainDistribution.openRuntimeHost(path, options),
        openInspection: async (queries) => {
          queried = queries.length;
          for (const query of queries) {
            assert.equal(query.kind, "concrete");
            const fields = (query as unknown as {
              constraints: { fields: Record<string, unknown[]> };
            }).constraints.fields;
            assert.deepEqual(fields.resolution, ["2K"]);
            assert.deepEqual(fields.aspectRatio, ["9:16"]);
          }
          return {
            dataRoot: "/tmp",
            endpoints: async () => queries.map((query) => ({
              need: query.need, capability: query.capability, status: "resolved" as const, support: "supported" as const,
              endpoint: "test.vendor", use: "test.provider",
            })),
            pricing: async () => queries.map((query) => ({
              need: query.need, capability: query.capability, status: "resolved" as const, support: "supported" as const,
              endpoint: "test.vendor", use: "test.provider",
              pricingDocuments: [{ source: "https://vendor.example/rates", data: { creditsPerImage: 2 } }],
            })),
            preflight: async () => ({ dataRoot: "/tmp", diagnostics: [] }),
            executionStatus: async () => ({ state: "stopped" as const }),
            ensureExecution: async () => ({ state: "stopped" as const }),
            createRuntime: async () => { throw new Error("pricing cannot execute a Build"); },
            close() {},
          };
        },
        pricing: async (queries) => {
          queried = queries.length;
          return queries.map((query) => ({
            need: query.need, capability: query.capability, status: "resolved" as const, support: "supported" as const,
            endpoint: "test.vendor", use: "test.provider",
            pricingDocuments: [{ source: "https://vendor.example/rates", data: { creditsPerImage: 2 } }],
          }));
        },
        createRuntime: async () => { throw new Error("pricing cannot execute a Build"); },
      }),
    });
    const report = JSON.parse(output);
    assert.equal(queried, 25);
    assert.equal(report.format, "hypit.cli-pricing@1");
    assert.equal(report.requestCount, 25);
    assert.equal(report.groups.length, 1);
    const group = report.groups[0];
    assert.equal(group.requests.length, 25);
    assert.deepEqual(group.pricingDocuments[0].data, { creditsPerImage: 2 });
    for (const request of group.requests) {
      assert.deepEqual(request, { readiness: "concrete", pending: [] });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
