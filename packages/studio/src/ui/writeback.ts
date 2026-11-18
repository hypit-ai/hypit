import type { StudioMutation } from "../shared.js";

export async function applyStudioMutation(mutation: StudioMutation): Promise<number> {
  const response = await fetch("/__studio/mutation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(mutation),
  });
  if (!response.ok) throw new Error(await response.text());
  const payload = await response.json() as { readonly revision?: unknown };
  return typeof payload.revision === "number" ? payload.revision : mutation.revision;
}
