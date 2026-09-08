import type { CliMachineView } from "../output.js";

export type OperationalWriter = (
  machine: CliMachineView,
  title: string,
  status?: "success" | "warning" | "error" | "info",
  facts?: readonly (readonly [string, string])[],
  lines?: readonly string[],
) => void;
