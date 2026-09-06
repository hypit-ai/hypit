import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { nodeResolve } from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { dts } from "rollup-plugin-dts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
const outputRoot = resolve(packageRoot, "dist/public");

function publicEntryTarget(name, declared) {
  if (typeof declared === "string") {
    throw new Error(`${name} must declare separate types and import targets`);
  }
  if (declared === null || typeof declared !== "object") {
    throw new Error(`${name} has an unsupported export declaration`);
  }
  if (typeof declared.types !== "string" || typeof declared.import !== "string") {
    throw new Error(`${name} must declare string types and import targets`);
  }
  return { input: declared.import, output: declared.types };
}

const entries = Object.entries(manifest.exports ?? {}).map(([name, declared]) => {
  if (!name.startsWith("./") || name === "./") {
    throw new Error(`Unsupported public export name ${name}`);
  }
  const target = publicEntryTarget(name, declared);
  const input = resolve(packageRoot, target.input);
  const output = resolve(packageRoot, target.output);
  const relativeOutput = relative(outputRoot, output);
  if (relativeOutput === "" || relativeOutput === ".."
    || relativeOutput.startsWith(`..${sep}`) || isAbsolute(relativeOutput)) {
    throw new Error(`${name} writes outside dist/public`);
  }
  return { name, input, output };
});

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const entry of entries) {
  const bundle = await rollup({
    input: entry.input,
    onwarn(warning, warn) {
      if (warning.code === "UNRESOLVED_IMPORT") {
        throw new Error(`${entry.name}: ${warning.message}`);
      }
      warn(warning);
    },
    plugins: [
      nodeResolve({ extensions: [".ts", ".d.ts", ".js"] }),
      dts({ respectExternal: false }),
    ],
  });
  try {
    await bundle.write({ file: entry.output, format: "es" });
  } finally {
    await bundle.close();
  }
}
