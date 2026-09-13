import type { AgentSessionLiveRef } from "@openducktor/contracts";
import type { Effect } from "effect";
import type { HostError } from "../effect/host-errors";
import type {
  AgentSessionLiveAdapterBinding,
  AgentSessionLiveAdapterPort,
  AgentSessionLiveRegistration,
} from "./agent-session-live-adapter-port";

/** Runtime-starter boundary for registering and releasing ephemeral live projections. */
export type RuntimeLiveSessionLifecyclePort = {
  readonly registerRuntimeAdapter: (
    adapter: AgentSessionLiveAdapterPort,
  ) => Effect.Effect<void, HostError>;
  readonly releaseRuntime: (
    runtimeId: string,
  ) => Effect.Effect<ReadonlyArray<AgentSessionLiveRef>, HostError>;
  readonly createRuntimeRegistration: (
    binding: AgentSessionLiveAdapterBinding,
  ) => AgentSessionLiveRegistration;
};

export type PreparedRuntimeLiveSessionAdapter = {
  readonly adapter: AgentSessionLiveAdapterPort;
  /** Starts ordered forwarding only after the live adapter is registered. */
  readonly startForwarding: () => Effect.Effect<void, HostError>;
  /** Releases adapter-local observation/state when startup fails before registration. */
  readonly discard: () => Effect.Effect<void, HostError>;
};
