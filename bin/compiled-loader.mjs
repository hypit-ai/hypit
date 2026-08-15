import { existsSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(repository, "dist/cli");

function sourceUrl(url) {
  if (!url.startsWith("file:")) return undefined;
  const built = fileURLToPath(url);
  const path = relative(output, built);
  if (path === ".." || path.startsWith(`..${sep}`)) return undefined;
  return pathToFileURL(resolve(repository, path.replace(/\.js$/u, ".ts"))).href;
}

function builtUrl(url) {
  if (!url.startsWith("file:") || !url.endsWith(".ts")) return undefined;
  const source = fileURLToPath(url);
  const path = relative(repository, source);
  if (path === ".." || path.startsWith(`..${sep}`)) return undefined;
  const match = /^packages\/([^/]+)\/src\/(.+)\.ts$/u.exec(path.split(sep).join("/"));
  if (match === null) return undefined;
  const built = resolve(repository, "packages", match[1], "dist", `${match[2]}.js`);
  return existsSync(built) ? pathToFileURL(built).href : undefined;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved;
    try {
      resolved = nextResolve(specifier, context);
    } catch (error) {
      const parent = context.parentURL === undefined ? undefined : sourceUrl(context.parentURL);
      if (parent === undefined || specifier.startsWith("node:") || specifier.startsWith(".") || specifier.startsWith("/")) {
        throw error;
      }
      resolved = { url: pathToFileURL(createRequire(parent).resolve(specifier)).href };
    }
    const built = builtUrl(resolved.url);
    return built === undefined ? resolved : { ...resolved, url: built };
  },
});
