import { expect, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { AgentSessionReadModelStateContext } from "@/state/app-state-contexts";
import { WorkspaceSessionReadModelNotice } from "./workspace-session-content";

test.each(["records", "live"] as const)(
  "shows the %s error with an explicit Retry action",
  (source) => {
    let retries = 0;
    const view = render(
      <AgentSessionReadModelStateContext
        value={{
          sessionReadModelLoadState:
            source === "live"
              ? {
                  kind: "failed",
                  workspaceRepoPath: "/repo",
                  message: "Live status failed",
                  source: "live-stream",
                }
              : { kind: "ready", workspaceRepoPath: "/repo" },
          workspaceSessionRecordsError: "Chat records failed",
          getSessionFault: () => null,
          reloadSessionReadModel: () => {
            retries += 1;
          },
        }}
      >
        <WorkspaceSessionReadModelNotice />
      </AgentSessionReadModelStateContext>,
    );
    try {
      expect(view.getByRole("alert").textContent).toContain(
        source === "live" ? "Live status failed" : "Chat records failed",
      );
      fireEvent.click(view.getByRole("button", { name: "Retry" }));
      expect(retries).toBe(1);
    } finally {
      view.unmount();
    }
  },
);
