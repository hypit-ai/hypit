export type WorkbenchCredential = {
  readonly endpoint: string;
  readonly slot: string;
  readonly label: string;
  readonly configured: boolean;
  readonly writable: boolean;
  readonly acquisition?: "oauth2-pkce";
};

/** Transient application environment; it is never Project Object or authoring state. */
export type WorkbenchEnvironment = {
  readonly status: "ready" | "action-required" | "unavailable";
  readonly environment: {
    readonly selected: boolean;
    readonly label?: string;
    readonly candidate?: string;
  };
  readonly credentials: readonly WorkbenchCredential[];
  readonly issue?: string;
};
