import { mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const stateDirectoryName = ".svml";
const selectionFileName = "runtime";

export type RuntimeProfileSelection = {
  readonly profile: string;
  readonly projectRoot: string;
  readonly selectionFile: string;
};

function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === "object" && "code" in error
    ? String((error as { readonly code?: unknown }).code)
    : undefined;
}

async function readSelectionFile(start: string): Promise<{
  readonly projectRoot: string;
  readonly selectionFile: string;
  readonly value: string;
} | undefined> {
  let directory = resolve(start);
  while (true) {
    const selectionFile = resolve(directory, stateDirectoryName, selectionFileName);
    try {
      return {
        projectRoot: directory,
        selectionFile,
        value: (await readFile(selectionFile, "utf8")).trim(),
      };
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

/**
 * Remember one Runtime Profile for a project. This is local CLI context, not
 * Author Source, Run Source, package selection or Core state.
 */
export async function selectRuntimeProfile(projectRoot: string, profile: string): Promise<RuntimeProfileSelection> {
  const root = await realpath(resolve(projectRoot));
  const selectedProfile = await realpath(resolve(profile));
  const stateDirectory = resolve(root, stateDirectoryName);
  const selectionFile = resolve(stateDirectory, selectionFileName);
  await mkdir(stateDirectory, { recursive: true });
  try {
    await writeFile(resolve(stateDirectory, ".gitignore"), "*\n", { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
  }
  const stored = relative(root, selectedProfile) || ".";
  await writeFile(selectionFile, `${stored}\n`, "utf8");
  return { profile: selectedProfile, projectRoot: root, selectionFile };
}

/** Find the nearest project-local Runtime selection, starting at a file's directory or cwd. */
export async function findRuntimeProfile(start: string): Promise<RuntimeProfileSelection | undefined> {
  const selected = await readSelectionFile(start);
  if (selected === undefined) return undefined;
  if (selected.value.length === 0) {
    throw new Error(`Runtime selection is empty: ${selected.selectionFile}; run narratage runtime use <profile>`);
  }
  const projectRoot = await realpath(selected.projectRoot);
  const candidate = resolve(projectRoot, selected.value);
  try {
    return {
      profile: await realpath(candidate),
      projectRoot,
      selectionFile: selected.selectionFile,
    };
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new Error(
        `Selected Runtime Profile no longer exists: ${candidate}; run narratage runtime use <profile>`,
      );
    }
    throw error;
  }
}

/** Remove only the local pointer. Runtime state, locks, services and Builds are untouched. */
export async function clearRuntimeProfile(start: string): Promise<RuntimeProfileSelection | undefined> {
  const selected = await readSelectionFile(start);
  if (selected === undefined) return undefined;
  const profile = resolve(selected.projectRoot, selected.value);
  await unlink(selected.selectionFile);
  return {
    profile,
    projectRoot: selected.projectRoot,
    selectionFile: selected.selectionFile,
  };
}
