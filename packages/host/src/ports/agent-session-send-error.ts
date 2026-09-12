import type { HostInvokeFailure } from "@openducktor/contracts";
import { HostOperationError } from "../effect/host-errors";

type AcceptedMessageFailure = Extract<
  HostInvokeFailure,
  { kind: "agent_session_message_accepted" }
>;

export class AgentSessionMessageAcceptedError extends HostOperationError {
  readonly failure: AcceptedMessageFailure;

  constructor(input: Omit<AcceptedMessageFailure, "kind">, cause: Error) {
    super({
      operation: "agent-session.send-message",
      message: `The runtime accepted the message, but the session update failed. Do not send the message again. ${cause.message}`,
      cause,
    });
    this.failure = { kind: "agent_session_message_accepted", ...input };
  }
}
