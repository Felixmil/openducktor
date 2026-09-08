import {
  CreateTaskInputSchema,
  createTaskResultSchema,
  searchTasksResultSchema,
  type PublicTaskSummaryTask,
} from "@openducktor/contracts";
import { Check, CircleAlert, ListPlus, LoaderCircle, Search } from "lucide-react";
import { IssueTypeBadge } from "@/components/features/kanban/issue-type-badge";
import { PriorityBadge } from "@/components/features/kanban/priority-badge";
import { TaskIdBadge } from "@/components/features/tasks/task-id-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskLabelChip } from "@/components/ui/task-label-chip";
import { statusBadgeClassName, statusLabel } from "@/lib/task-status-presentation";
import type { ToolMeta } from "./agent-chat-message-card-model.types";
import { getToolLifecyclePhase } from "./tool-lifecycle";

type TaskTool = "create_task" | "search_tasks";
type TaskToolResult = { tasks: PublicTaskSummaryTask[]; totalCount: number; hasMore: boolean };

const readTaskToolResult = (tool: TaskTool, output: string | undefined): TaskToolResult | null => {
  if (!output) return null;
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    return null;
  }
  if (tool === "create_task") {
    const result = createTaskResultSchema.safeParse(value);
    return result.success ? { tasks: [result.data.task], totalCount: 1, hasMore: false } : null;
  }
  const result = searchTasksResultSchema.safeParse(value);
  return result.success
    ? {
        tasks: result.data.results.map((entry) => entry.task),
        totalCount: result.data.totalCount,
        hasMore: result.data.hasMore,
      }
    : null;
};

const TaskResultCard = ({ task }: { task: PublicTaskSummaryTask }) => (
  <Card className="min-w-0 overflow-hidden" data-task-id={task.id}>
    <CardHeader className="gap-3 px-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TaskIdBadge taskId={task.id} />
        <Badge variant="outline" className={statusBadgeClassName(task.status)}>
          {statusLabel(task.status)}
        </Badge>
      </div>
      <CardTitle className="break-words">{task.title}</CardTitle>
      {task.description && (
        <CardDescription className="line-clamp-3 whitespace-pre-wrap break-words">
          {task.description}
        </CardDescription>
      )}
    </CardHeader>
    <CardContent className="flex flex-wrap items-center gap-2 px-4 py-4">
      <IssueTypeBadge issueType={task.issueType} />
      <PriorityBadge priority={task.priority} />
      {task.labels.map((label) => (
        <TaskLabelChip key={label} label={label} truncateLabel />
      ))}
    </CardContent>
  </Card>
);

export const AgentChatTaskTool = ({
  meta,
  tool,
  timeLabel,
}: {
  meta: ToolMeta;
  tool: TaskTool;
  timeLabel: string;
}) => {
  const phase = getToolLifecyclePhase(meta);
  const isActive = phase === "queued" || phase === "executing";
  const result = phase === "completed" ? readTaskToolResult(tool, meta.output) : null;
  const invalidResult = phase === "completed" && result === null;
  const failed = phase === "failed" || invalidResult;
  const Icon = tool === "create_task" ? ListPlus : Search;
  const inputTitle = CreateTaskInputSchema.shape.title.safeParse(meta.input?.title);
  let status = "Task created";
  if (tool === "search_tasks" && result)
    status = `${result.totalCount} ${result.totalCount === 1 ? "task" : "tasks"} found`;
  if (isActive) status = tool === "create_task" ? "Creating task…" : "Searching tasks…";
  if (phase === "cancelled") status = "Cancelled";
  if (failed) status = "Failed";
  return (
    <section aria-label={tool} className="flex min-w-0 max-w-2xl flex-col gap-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
        <span className="font-mono font-medium text-foreground">{tool}</span>
        <span className="inline-flex items-center gap-1.5" role="status">
          {isActive && <LoaderCircle aria-hidden="true" className="size-3 animate-spin" />}
          {result && <Check aria-hidden="true" className="size-3 text-success-muted" />}
          {failed && <CircleAlert aria-hidden="true" className="size-3 text-destructive" />}
          {status}
        </span>
        {timeLabel && <span className="ml-auto">{timeLabel}</span>}
      </div>
      {isActive && (
        <Card>
          <CardHeader className="px-4 pt-4">
            <CardTitle>{inputTitle.success ? inputTitle.data : status}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground">Waiting for OpenDucktor</p>
          </CardContent>
        </Card>
      )}
      {result && (
        <div className="grid min-w-0 gap-3">
          {result.tasks.map((task) => (
            <TaskResultCard key={task.id} task={task} />
          ))}
        </div>
      )}
      {result?.tasks.length === 0 && (
        <p className="text-sm text-muted-foreground">No tasks match this search.</p>
      )}
      {result?.hasMore && (
        <p className="text-xs text-muted-foreground">
          Showing {result.tasks.length} of {result.totalCount} tasks. Refine the search to see other
          results.
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {invalidResult
            ? "OpenDucktor returned an invalid task result. Expand tool details to inspect the response."
            : meta.error || "The task tool failed. Expand tool details to inspect the response."}
        </p>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer rounded-sm hover:text-foreground focus-visible:outline-ring">
          Tool details
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted p-3">
          {JSON.stringify({ input: meta.input, output: meta.output, error: meta.error }, null, 2)}
        </pre>
      </details>
    </section>
  );
};
