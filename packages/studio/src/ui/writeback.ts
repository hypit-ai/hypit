import type { Range } from "../shared.js";

export type SourcePatch = {
  readonly path: string;
  readonly range: Range;
  readonly replacement: string;
  readonly preimage: string;
};

export async function writeSourceTransaction(revision: number, patches: readonly SourcePatch[]): Promise<void> {
  const response = await fetch("/__studio/transaction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revision, patches }),
  });
  if (!response.ok) throw new Error(await response.text());
}
