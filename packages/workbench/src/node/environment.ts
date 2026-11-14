import type { WorkbenchEnvironment } from "../environment-protocol.js";

/** Application-owned Environment and credential actions shared by every browser Bench. */
export type WorkbenchEnvironmentHost = {
  observe(): Promise<WorkbenchEnvironment>;
  connect(): Promise<WorkbenchEnvironment>;
};

const unavailable: WorkbenchEnvironment = {
  status: "unavailable",
  environment: { selected: false },
  credentials: [],
  issue: "当前 Host 没有提供执行环境。",
};

export async function observeWorkbenchEnvironment(
  host: WorkbenchEnvironmentHost | undefined,
): Promise<WorkbenchEnvironment> {
  return host === undefined ? unavailable : await host.observe();
}

export async function connectWorkbenchEnvironment(
  host: WorkbenchEnvironmentHost | undefined,
): Promise<WorkbenchEnvironment> {
  return host === undefined ? unavailable : await host.connect();
}
