import type { EndpointInstance } from "@hypit/endpoint";
import type { CredentialAcquisition, CredentialRef, CredentialStore } from "@hypit/execution-environment";

export type EnvironmentCredentialDescription = {
  readonly endpoint: string;
  readonly slot: string;
  readonly label: string;
  readonly kind: "secret" | "json";
  readonly ref: CredentialRef;
  readonly acquisition?: CredentialAcquisition;
  readonly writable: boolean;
};

export type EnvironmentCredentialStatus = EnvironmentCredentialDescription & {
  readonly configured: boolean;
};

export type LocalEnvironmentCredentialControl = {
  /** Endpoint declarations and Store write capability; never reads an existing secret. */
  describeCredentials(endpoint?: string): Promise<readonly EnvironmentCredentialDescription[]>;
  credentials(endpoint?: string): Promise<readonly EnvironmentCredentialStatus[]>;
  putCredential(endpoint: string, slot: string, secret: string): Promise<EnvironmentCredentialStatus>;
  deleteCredential(endpoint: string, slot: string): Promise<{
    readonly deleted: boolean;
    readonly credential: EnvironmentCredentialStatus;
  }>;
  close(): void | Promise<void>;
};

export type CreateLocalEnvironmentCredentialControlOptions = {
  readonly credentialStore: CredentialStore;
  readonly endpoints: readonly EndpointInstance[];
  readonly close?: () => void | Promise<void>;
};
