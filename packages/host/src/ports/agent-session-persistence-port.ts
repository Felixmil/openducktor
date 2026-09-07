import type {
  AcceptedAgentUserMessage,
  AgentSessionControlResumeInput,
  AgentSessionControlSendInput,
  AgentSessionControlUpdateModelInput,
  AgentSessionLiveEnvelope,
  AgentSessionLiveRef,
} from "@openducktor/contracts";
import type { Effect } from "effect";
import type { HostError } from "../effect/host-errors";

export type AgentSessionPersistencePort = {
  prepareResume(
    input: AgentSessionControlResumeInput,
  ): Effect.Effect<AgentSessionControlResumeInput, HostError>;
  prepareSend(
    input: AgentSessionControlSendInput,
  ): Effect.Effect<AgentSessionControlSendInput, HostError>;
  validateRef(input: AgentSessionLiveRef): Effect.Effect<void, HostError>;
  validateModelUpdate(input: AgentSessionControlUpdateModelInput): Effect.Effect<void, HostError>;
  recordModelUpdate(input: AgentSessionControlUpdateModelInput): Effect.Effect<void, HostError>;
  recordAcceptedMessage(
    input: AgentSessionLiveRef,
    message: AcceptedAgentUserMessage,
  ): Effect.Effect<void, HostError>;
  observe(envelope: AgentSessionLiveEnvelope): Effect.Effect<void, HostError>;
};
