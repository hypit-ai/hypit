import { rollup } from "rollup";
import { dts } from "rollup-plugin-dts";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const declarationPackages = resolve(packageRoot, "dist/public-source/packages");

const serializedEntry = process.argv[2];
if (serializedEntry === undefined) {
  throw new Error("A serialized public type entry is required");
}

const entry = JSON.parse(serializedEntry);
if (entry === null || typeof entry !== "object"
  || typeof entry.name !== "string"
  || typeof entry.input !== "string"
  || typeof entry.output !== "string") {
  throw new Error("The public type entry is invalid");
}

const bundle = await rollup({
  input: entry.input,
  onwarn(warning, warn) {
    if (warning.code === "UNRESOLVED_IMPORT") {
      throw new Error(`${entry.name}: ${warning.message}`);
    }
    warn(warning);
  },
  plugins: [
    {
      name: "hypit-public-declarations",
      resolveId(source) {
        const match = /^@hypit\/([^/]+)$/.exec(source);
        return match === null
          ? null
          : resolve(declarationPackages, match[1], "src/index.d.ts");
      },
    },
    dts(),
  ],
});

try {
  await bundle.write({ file: entry.output, format: "es" });
} finally {
  await bundle.close();
}
