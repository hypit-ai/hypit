import { rollup } from "rollup";
import { dts } from "rollup-plugin-dts";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const declarationPackages = resolve(packageRoot, "dist/public-source/packages");
const distributionManifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));

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
        if (source.startsWith(`${distributionManifest.name}/`)) {
          const exportName = `.${source.slice(distributionManifest.name.length)}`;
          const declared = distributionManifest.exports?.[exportName];
          const target = typeof declared === "string"
            ? declared
            : declared?.["hypit-source"] ?? declared?.import;
          const match = typeof target === "string"
            ? /^\.\/packages\/([^/]+)\/src\/(.+)\.ts$/u.exec(target)
            : null;
          if (match !== null) return resolve(declarationPackages, match[1], "src", `${match[2]}.d.ts`);
        }
        const match = /^@hypit\/([^/]+)(?:\/(.+))?$/.exec(source);
        if (match === null) return null;
        const root = resolve(declarationPackages, match[1], "src");
        if (match[2] === undefined) return resolve(root, "index.d.ts");
        const file = resolve(root, `${match[2]}.d.ts`);
        if (existsSync(file)) return file;
        const index = resolve(root, match[2], "index.d.ts");
        return existsSync(index) ? index : null;
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
