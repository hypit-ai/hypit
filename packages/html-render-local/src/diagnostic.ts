/** Process evidence emitted by one local render attempt. Hosts decide where to retain it. */
export type HtmlRenderDiagnostic = {
  readonly level: "info" | "warning" | "error";
  readonly message: string;
  readonly stream?: "stdout" | "stderr";
};
