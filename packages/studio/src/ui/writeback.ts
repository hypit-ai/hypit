import type { StudioMutation } from "../shared.js";

export async function applyStudioMutation(mutation: StudioMutation): Promise<void> {
  const response = await fetch("/__studio/mutation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(mutation),
  });
  if (!response.ok) throw new Error(await response.text());
}
