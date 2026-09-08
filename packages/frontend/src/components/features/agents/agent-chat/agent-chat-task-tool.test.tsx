import { expect, test } from "bun:test";
import type { PublicTaskSummaryTask } from "@openducktor/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import type { ToolMeta } from "./agent-chat-message-card-model.types";
import { createMessageCardElement } from "./agent-chat-message-card-test-harness";

const task = (id = "task-1"): PublicTaskSummaryTask => ({
  id,
  title: "Add task search shortcut",
  description: "Focus search with the keyboard.",
  status: "open",
  priority: 2,
  issueType: "task",
  labels: ["accessibility"],
  aiReviewEnabled: true,
  createdAt: "2026-09-08T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
  qaVerdict: "not_reviewed",
  documents: { hasSpec: false, hasPlan: false, hasQaReport: false },
});

const renderTool = (tool: string, fields: Partial<ToolMeta>) =>
  renderToStaticMarkup(
    createMessageCardElement({
      message: {
        id: "m1",
        role: "tool",
        content: "",
        timestamp: "2026-09-08T10:00:00.000Z",
        meta: {
          kind: "tool",
          partId: "p1",
          callId: "c1",
          tool,
          toolType: "generic",
          status: "completed",
          ...fields,
        },
      },
      sessionAgentColors: {},
    }),
  );

test("renders create_task through the real message card as a Kanban-style task", () => {
  const html = renderTool("openducktor_odt_create_task", {
    output: JSON.stringify({ task: task() }),
  });
  expect(html).toContain('aria-label="create_task"');
  expect(html).toContain('data-task-id="task-1"');
  expect(html).toContain("Task created");
  expect(html).toContain("Add task search shortcut");
  expect(html).toContain("accessibility");
  expect(html).toContain("P2");
  expect(html).not.toContain("odt_create_task");
});

test("renders search_tasks results with totals, empty results, and truncation", () => {
  const html = renderTool("odt_search_tasks", {
    output: JSON.stringify({
      results: [{ task: task() }, { task: task("task-2") }],
      limit: 2,
      totalCount: 5,
      hasMore: true,
    }),
  });
  expect(html).toContain('data-task-id="task-1"');
  expect(html).toContain('data-task-id="task-2"');
  expect(html).toContain("5 tasks found");
  expect(html).toContain("Showing 2 of 5 tasks");
  const empty = renderTool("odt_search_tasks", {
    output: JSON.stringify({ results: [], limit: 10, totalCount: 0, hasMore: false }),
  });
  expect(empty).toContain("No tasks match this search.");
});

test("does not claim task creation before completion or after failure", () => {
  const input = { title: "Draft task" };
  for (const status of ["pending", "running", "error"] as const) {
    const fields: Partial<ToolMeta> = { status, input };
    if (status === "error") fields.error = "Database unavailable";
    const html = renderTool("odt_create_task", fields);
    expect(html).not.toContain("Task created");
    expect(html).not.toContain("data-task-id");
    if (status === "error") expect(html).toContain("Database unavailable");
    else expect(html).toContain("Creating task");
  }
});

test.each(["not JSON", JSON.stringify({ task: { id: "fake", title: "Incomplete" } })])(
  "reports invalid successful output without fabricating a task card",
  (output) => {
    const html = renderTool("odt_create_task", { output });
    expect(html).toContain("invalid task result");
    expect(html).not.toContain("Task created");
    expect(html).not.toContain("data-task-id");
    expect(html).toContain("Tool details");
  },
);
