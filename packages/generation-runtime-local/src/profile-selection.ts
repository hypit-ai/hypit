import { mkdir, readFile, realpath, stat, unlink, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const privateStateDirectoryName = ".hypit";
const generationStateDirectoryName = ".hypit/generation";
const selectionFileName = "runtime-profile";

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

async function readSelectionFile(projectRoot: string): Promise<{
  readonly projectRoot: string;
  readonly selectionFile: string;
  readonly value: string;
} | undefined> {
  const root = resolve(projectRoot);
  const selectionFile = resolve(root, generationStateDirectoryName, selectionFileName);
  try {
    if (!(await stat(selectionFile)).isFile()) {
      throw new Error(`Runtime selection must be a file: ${selectionFile}; this path is occupied by a directory. `
        + "Move that directory and update its configuration before running hypit runtime use <profile>.");
    }
    return { projectRoot: root, selectionFile, value: (await readFile(selectionFile, "utf8")).trim() };
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  }
}

/** Remember one Local Runtime Profile for a project without changing project Sources. */
export async function selectRuntimeProfile(projectRoot: string, profile: string): Promise<RuntimeProfileSelection> {
  const root = await realpath(resolve(projectRoot));
  const selectedProfile = await realpath(resolve(profile));
  const privateStateDirectory = resolve(root, privateStateDirectoryName);
  const stateDirectory = resolve(root, generationStateDirectoryName);
  const selectionFile = resolve(stateDirectory, selectionFileName);
  await mkdir(stateDirectory, { recursive: true });
  try {
    await writeFile(resolve(privateStateDirectory, ".gitignore"), "*\n", { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
  }
  await readSelectionFile(root);
  await writeFile(selectionFile, `${relative(root, selectedProfile) || "."}\n`, "utf8");
  return { profile: selectedProfile, projectRoot: root, selectionFile };
}

/** Read only the explicitly resolved project's Local Runtime selection. */
export async function findRuntimeProfile(projectRoot: string): Promise<RuntimeProfileSelection | undefined> {
  const selected = await readSelectionFile(projectRoot);
  if (selected === undefined) return undefined;
  if (selected.value.length === 0) {
    throw new Error(`Runtime selection is empty: ${selected.selectionFile}; run hypit runtime use <profile>`);
  }
  const candidate = resolve(selected.projectRoot, selected.value);
  try {
    return {
      profile: await realpath(candidate),
      projectRoot: selected.projectRoot,
      selectionFile: selected.selectionFile,
    };
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new Error(`Selected Runtime Profile no longer exists: ${candidate}; run hypit runtime use <profile>`);
    }
    throw error;
  }
}

/** Remove only the project-local pointer. Runtime state, Programs and Builds are untouched. */
export async function clearRuntimeProfile(projectRoot: string): Promise<RuntimeProfileSelection | undefined> {
  const selected = await readSelectionFile(projectRoot);
  if (selected === undefined) return undefined;
  const profile = resolve(selected.projectRoot, selected.value);
  await unlink(selected.selectionFile);
  return { profile, projectRoot: selected.projectRoot, selectionFile: selected.selectionFile };
}
