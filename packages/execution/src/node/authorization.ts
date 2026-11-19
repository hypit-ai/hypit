export type ExecutionAuthorizationStatus =
  | { readonly status: "disconnected" }
  | { readonly status: "connected" | "needs-refresh" | "reconnect"; readonly expiresAt: number;
      readonly refreshExpiresAt?: number };

export type ExecutionAuthorizationAttempt = {
  readonly id: string;
  readonly authorizationUrl: string;
  readonly expiresAt: number;
} & ({ readonly state: "pending" }
  | { readonly state: "complete"; readonly connection: ExecutionAuthorizationStatus }
  | { readonly state: "failed"; readonly error: string });

export type ExecutionAuthorization = {
  status(): Promise<ExecutionAuthorizationStatus>;
  disconnect(): Promise<void>;
  begin(manual: boolean): Promise<ExecutionAuthorizationAttempt>;
  observe(id: string): ExecutionAuthorizationAttempt;
  complete(id: string, proof: string): Promise<ExecutionAuthorizationAttempt>;
  cancel(id: string): void;
  close(): void;
};
