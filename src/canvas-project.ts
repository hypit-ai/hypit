import { NodeApplicationProjectOperationError, type NodeApplicationProjectAdapter, type NodeApplicationProjectRequest } from "@hypit/application/node";
import { CanvasError, record, text, type CanvasTransaction } from "@hypit/canvas";
import { createNodeCanvas, openNodeCanvas } from "@hypit/canvas/node";

export function canvasProjectAdapter(options: { readonly ffprobePath?: string } = {}): NodeApplicationProjectAdapter {
  return {
    owner: "canvas",
    async operate(request) {
      try { return await operate(request, options); }
      catch (error) {
        if (!(error instanceof CanvasError)) throw error;
        const status = ["revision-conflict", "destination-exists", "invocation-conflict"].includes(error.code) ? 409 : 400;
        throw new NodeApplicationProjectOperationError(error.message, status, error.code, error.subject);
      }
    },
  };
}

async function operate(
  { project, operation, input, signal }: NodeApplicationProjectRequest, options: { readonly ffprobePath?: string },
) {
  const { document, value } = record(input, "Canvas operation", ["document", "value"]);
  const path = text(document, "Canvas document path");
  if (operation === "create") {
    const { name } = record(value, "Canvas creation", ["name"]);
    await createNodeCanvas(project, path, text(name, "Canvas name"));
  }
  const canvas = await openNodeCanvas(project, path, options);
  try {
    switch (operation) {
      case "create": return await canvas.observe({ kind: "board" });
      case "observe": return await canvas.observe(value);
      case "command": return await canvas.transact(value as CanvasTransaction);
      case "quote": return await canvas.quote(value, signal);
      case "invoke": return await canvas.invoke(value, signal);
      case "cancel": return await canvas.cancel(value);
      case "adopt": return await canvas.adopt(value, signal);
      default: throw new CanvasError("invalid-operation", "Unknown Canvas operation.");
    }
  } finally {
    canvas.close();
  }
}
