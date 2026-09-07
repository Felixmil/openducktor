import type {
  AgentSessionModelSelection,
  RuntimeKind,
  WorkspaceSession,
  WorkspaceSessionActivity,
} from "@openducktor/contracts";
import type { Effect } from "effect";
import type { TaskStoreError } from "./task-repository-ports";

export type WorkspaceSessionStoreScope = { repoPath: string; workspaceId: string };
export type WorkspaceSessionStoreRef = WorkspaceSessionStoreScope & { sessionId: string };
type Result<A = WorkspaceSession> = Effect.Effect<A, TaskStoreError>;

export type WorkspaceSessionStorePort = {
  get(input: WorkspaceSessionStoreRef): Result;
  listActive(input: WorkspaceSessionStoreScope): Result<WorkspaceSession[]>;
  listArchived(input: WorkspaceSessionStoreScope): Result<WorkspaceSession[]>;
  findByRuntimeSession(
    input: WorkspaceSessionStoreScope & { runtimeKind: RuntimeKind; externalSessionId: string },
  ): Result<WorkspaceSession | null>;
  create(input: WorkspaceSessionStoreScope & { session: WorkspaceSession }): Result;
  rename(input: WorkspaceSessionStoreRef & { manualTitle: string | null }): Result;
  archive(input: WorkspaceSessionStoreRef & { archivedAt: number }): Result;
  restore(input: WorkspaceSessionStoreRef): Result;
  setSelectedModel(
    input: WorkspaceSessionStoreRef & { selectedModel: AgentSessionModelSelection },
  ): Result;
  setGeneratedTitle(input: WorkspaceSessionStoreRef & { generatedTitle: string }): Result;
  recordActivity(input: WorkspaceSessionStoreRef & { activity: WorkspaceSessionActivity }): Result;
};
