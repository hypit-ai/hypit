import type { BlobRef, TypeRef, Value } from '@hypit/protocol';
import type { BuildResultFileRef, BuildResultHistory } from './types.js';

/** Restore a typed result with each resource resolved by the receiving Host. */
export async function resolveBuildResultValue(
  history: BuildResultHistory,
  build: string,
  output: string,
  resource: (file: BuildResultFileRef) => Promise<BlobRef>,
): Promise<{ readonly type: TypeRef; readonly value: Value } | undefined> {
  const result = await history.resolve(build, output);
  if (!result) return undefined;
  if (result.value.kind === 'inline') return { type: result.type, value: result.value.value };
  if (result.value.kind === 'build-file') return { type: result.type, value: await resource(result.value) };
  let value: unknown = structuredClone(result.value.document.value);
  for (const binding of result.value.document.resources) {
    const blob = await resource(binding.file);
    if (!binding.at.length) { value = blob; continue; }
    let parent = value as Record<string | number, unknown>;
    for (const key of binding.at.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>;
    Object.defineProperty(parent, binding.at.at(-1)!, { value: blob, enumerable: true, writable: true, configurable: true });
  }
  return { type: result.type, value: value as Value };
}
