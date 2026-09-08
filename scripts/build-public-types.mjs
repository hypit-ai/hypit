import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
const outputRoot = resolve(packageRoot, "dist/public");
const declarationRoot = resolve(packageRoot, "dist/public-source");
const worker = resolve(packageRoot, "scripts/build-public-type-entry.mjs");
const publicTypeConfig = resolve(packageRoot, "scripts/tsconfig.public-types.json");
const require = createRequire(import.meta.url);
const typescriptCli = require.resolve("typescript/bin/tsc");

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
  const relativeInput = relative(packageRoot, input);
  if (relativeInput === "" || relativeInput === ".."
    || relativeInput.startsWith(`..${sep}`) || isAbsolute(relativeInput)
    || !relativeInput.endsWith(".ts")) {
    throw new Error(`${name} reads outside the Distribution TypeScript sources`);
  }
  const declarationInput = resolve(
    declarationRoot,
    `${relativeInput.slice(0, -3)}.d.ts`,
  );
  return { name, input: declarationInput, output };
});

function run(label, executable, args) {
  return new Promise((fulfill, reject) => {
    const child = spawn(executable, args, {
      cwd: packageRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        fulfill();
        return;
      }
      reject(new Error(
        signal === null
          ? `${label} exited with code ${String(code)}`
          : `${label} was terminated by ${signal}`,
      ));
    });
  });
}

await rm(outputRoot, { recursive: true, force: true });
await rm(declarationRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

try {
  await run("TypeScript declaration emit", process.execPath, [
    typescriptCli,
    "-p",
    publicTypeConfig,
  ]);
  for (const entry of entries) {
    await run(`${entry.name} type build`, process.execPath, [worker, JSON.stringify(entry)]);
  }
} finally {
  await rm(declarationRoot, { recursive: true, force: true });
}
