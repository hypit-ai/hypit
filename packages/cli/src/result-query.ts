import { resolve } from "node:path";

import type { BuildResultRepository, FinishedBuildResultManifest } from "@hypit/build-result";

export type BuildOutputHistoryPage = {
  readonly results: readonly FinishedBuildResultManifest[];
  /** Read older Builds strictly before this id. */
  readonly next?: string;
};

/**
 * Collect a page of matching Outputs rather than filtering one arbitrary page of Builds. This is a
 * request-local scan over the Repository's own chronological cursor; it creates no index or history.
 */
export async function browseBuildOutputHistory(
  repository: BuildResultRepository,
  request: {
    readonly projectRoot: string;
    readonly output: string;
    readonly source?: string;
    readonly before?: string;
    readonly limit: number;
  },
): Promise<BuildOutputHistoryPage> {
  const source = request.source === undefined ? undefined : resolve(request.source);
  const pageSize = Math.max(32, request.limit);
  let before = request.before;
  const matches: FinishedBuildResultManifest[] = [];
  while (matches.length < request.limit) {
    const page = await repository.browse({ limit: pageSize, ...(before === undefined ? {} : { before }) });
    if (page.results.length === 0) return { results: matches };
    for (let index = 0; index < page.results.length; index += 1) {
      const manifest = page.results[index]!;
      const sameSource = source === undefined
        || resolve(request.projectRoot, manifest.source.path) === source;
      if (sameSource && manifest.outputs[request.output] !== undefined) matches.push(manifest);
      if (matches.length === request.limit) {
        const hasOlder = index < page.results.length - 1 || page.next !== undefined;
        return { results: matches, ...(hasOlder ? { next: manifest.id } : {}) };
      }
    }
    if (page.next === undefined) return { results: matches };
    before = page.next;
  }
  return { results: matches };
}
