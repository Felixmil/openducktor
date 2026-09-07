import type { AgentSessionLiveEnvelope } from "@openducktor/contracts";
import { HostResourceError } from "../../effect/host-errors";
import type { HostEventBusPort } from "../../events/host-event-bus";

export const createNodeAgentSessionLivePublisher =
  (eventBus: HostEventBusPort | undefined) =>
  (envelope: AgentSessionLiveEnvelope): void => {
    if (!eventBus) {
      throw new HostResourceError({
        resource: "host-event-bus",
        operation: "agent-session-live.publish",
        message: "Live agent-session events require a configured host event bus.",
      });
    }
    eventBus.publish({
      channel: "openducktor://agent-session-live-event",
      payload: envelope,
    });
  };
