import type { OperationalMachineView } from "../machine-view.js";

export type OperationalWriter = (
  machine: OperationalMachineView,
  title: string,
  status?: "success" | "warning" | "error" | "info",
  facts?: readonly (readonly [string, string])[],
  lines?: readonly string[],
) => void;
