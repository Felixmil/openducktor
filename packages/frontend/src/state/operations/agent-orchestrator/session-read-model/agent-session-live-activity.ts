import type { AgentEvent } from "@openducktor/core";
import type { AgentSessionState } from "@/types/agent-orchestrator";
import { normalizeSessionErrorMessage } from "@/lib/session-error-message";
import { isStopAbortSessionErrorMessage } from "../support/tool-messages";

/** Apply ordered lifecycle facts before transcript assembly can buffer the event. */
const projectActivity = (current: AgentSessionState, event: AgentEvent): AgentSessionState => {
  if (
    event.type === "session_started" ||
    (event.type === "session_status" && event.status.type !== "idle")
  ) {
    return {
      ...current,
      status: "running",
      runtimeStatusMessage:
        event.type === "session_status" && event.status.type === "busy"
          ? event.status.message
          : null,
      pendingUserMessageStartedAt: undefined,
    };
  }
  if (event.type === "session_error" || event.type === "session_finished") {
    const stopped =
      Boolean(current.stopRequestedAt) &&
      (event.type === "session_finished" ||
        isStopAbortSessionErrorMessage(normalizeSessionErrorMessage(event.message)));
    let status: AgentSessionState["status"] = "idle";
    if (event.type === "session_error" || current.status === "error") status = "error";
    if (stopped) status = "stopped";
    return {
      ...current,
      status,
      runtimeStatusMessage: null,
      pendingUserMessageStartedAt: undefined,
      pendingApprovals: current.pendingApprovals.length === 0 ? current.pendingApprovals : [],
      pendingQuestions: current.pendingQuestions.length === 0 ? current.pendingQuestions : [],
    };
  }
  if (
    event.type === "session_idle" ||
    (event.type === "session_status" && event.status.type === "idle")
  ) {
    if (
      current.status === "starting" ||
      (current.pendingUserMessageStartedAt !== undefined &&
        current.pendingApprovals.length === 0 &&
        current.pendingQuestions.length === 0)
    )
      return current;
    const status =
      current.status === "error" || current.status === "stopped" ? current.status : "idle";
    return {
      ...current,
      status,
      runtimeStatusMessage: null,
      pendingUserMessageStartedAt: undefined,
    };
  }
  if (event.type === "assistant_message" || event.type === "turn_error") {
    return { ...current, pendingUserMessageStartedAt: undefined, runtimeStatusMessage: null };
  }
  if (
    event.type === "assistant_delta" &&
    event.delta.length > 0 &&
    (event.channel !== "text" || event.messageId)
  ) {
    return { ...current, status: "running", pendingUserMessageStartedAt: undefined };
  }
  if (event.type === "assistant_part") {
    const part = event.part;
    if (part.kind === "step" || (part.kind === "text" && part.synthetic)) return current;
    if (part.kind === "subagent") {
      return current.status === "running" || current.status === "starting"
        ? { ...current, pendingUserMessageStartedAt: undefined }
        : current;
    }
    const status =
      part.kind === "tool" && part.status !== "pending" && part.status !== "running"
        ? current.status
        : "running";
    return { ...current, status, pendingUserMessageStartedAt: undefined };
  }
  if (event.type === "user_message") return { ...current, runtimeStatusMessage: null };
  return current;
};

export const projectSessionTranscriptActivity = (
  current: AgentSessionState,
  event: AgentEvent,
): AgentSessionState => {
  const next = projectActivity(current, event);
  if (
    next.status === current.status &&
    next.runtimeStatusMessage === current.runtimeStatusMessage &&
    next.pendingUserMessageStartedAt === current.pendingUserMessageStartedAt &&
    next.pendingApprovals === current.pendingApprovals &&
    next.pendingQuestions === current.pendingQuestions
  )
    return current;
  return next;
};
