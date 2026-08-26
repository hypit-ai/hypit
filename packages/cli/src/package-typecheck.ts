import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

/**
 * Typecheck the author packages a project owns.
 *
 * A project-local package builds its picture in TypeScript: its Producer returns a list of elements,
 * and the field names on those elements are fixed by the Composition Types it imports. Nothing
 * authored carries them, so `check` has no Record to validate — the object does not exist until the
 * Producer runs, which is at Build.
 *
 * The compiler decides them without running anything. A media element's artifact field is `artifact`,
 * and writing `source` instead is `TS2353: 'source' does not exist in type 'VisualMediaElement'` —
 * available in a second, and otherwise first seen as a Build failure blaming a field the author never
 * typed.
 *
 * That check never ran on a project because the CLI loads TypeScript through tsx, which strips types
 * without reading them, and the tree's own `tsconfig.json` covers the packages it ships rather than
 * the ones a project writes.
 *
 * The options come from the Distribution's own `tsconfig.json`, so a project package is held to
 * exactly the standard the packages it imports are held to, and there is one place to change it.
 */
export function typecheckProjectPackages(
  projectRoot: string,
  distributionRoot: string | undefined,
): readonly string[] {
  if (distributionRoot === undefined) return [];
  const root = resolve(projectRoot);
  const distribution = resolve(distributionRoot);
  // A Distribution checking itself is `pnpm check`, over a different and much larger file set.
  if (root === distribution) return [];
  if (!existsSync(resolve(root, "packages"))) return [];

  const require = createRequire(resolve(distribution, "package.json"));
  let ts: typeof import("typescript");
  // A Distribution that ships no compiler cannot do this, and saying nothing is better than refusing
  // a project over the toolchain it was handed.
  try { ts = require("typescript") as typeof import("typescript"); } catch { return []; }

  // Where the compiler finds the packages a project imports. Hypit resolves `@hypit/x` by its own
  // walk to `<root>/packages/x`, and nothing links it into `node_modules`, so Node resolution — which
  // is what TypeScript follows — reaches none of them from a project. The Distribution says where
  // each one is in its own `package.json`, so the mapping is read rather than guessed.
  const paths: Record<string, string[]> = {};
  for (const entry of readdirSync(resolve(distribution, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const home = resolve(distribution, "packages", entry.name);
    const manifest = resolve(home, "package.json");
    if (!existsSync(manifest)) continue;
    const declared = JSON.parse(readFileSync(manifest, "utf8")) as {
      name?: string;
      exports?: string | Record<string, unknown>;
    };
    if (declared.name === undefined) continue;
    const root_ = typeof declared.exports === "string" ? declared.exports : declared.exports?.["."];
    if (typeof root_ === "string") paths[declared.name] = [resolve(home, root_)];
    // A deep import such as `@hypit/studio/src/domain.js` names a file inside the package.
    paths[`${declared.name}/*`] = [resolve(home, "*")];
  }

  const shipped = resolve(distribution, "tsconfig.json");
  const declared = existsSync(shipped)
    ? (ts.readConfigFile(shipped, ts.sys.readFile).config as { compilerOptions?: Record<string, unknown> }).compilerOptions
    : undefined;
  const parsed = ts.parseJsonConfigFileContent({
    compilerOptions: {
      ...(declared ?? { target: "ES2023", module: "NodeNext", moduleResolution: "NodeNext", strict: true }),
      // A project is read, never emitted, and its own layout decides nothing here.
      noEmit: true, declaration: false, sourceMap: false, composite: false, rootDir: undefined,
      skipLibCheck: true,
      baseUrl: root,
      paths,
      typeRoots: [resolve(distribution, "node_modules/@types")],
    },
    include: ["packages/*/src/**/*.ts"],
  }, ts.sys, root);
  if (parsed.fileNames.length === 0) return [];

  const host = {
    getCanonicalFileName: (name: string): string => name,
    getCurrentDirectory: (): string => root,
    getNewLine: (): string => "\n",
  };
  return ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options))
    .map((item) => ts.formatDiagnostic(item, host).trimEnd());
}
