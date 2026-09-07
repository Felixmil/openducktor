import {
  type WorkspaceSession,
  type WorkspaceSessionCreateInput,
  type WorkspaceSessionCreateResult,
  type WorkspaceSessionRefInput,
  workspaceSessionCreateResultSchema,
  workspaceSessionSchema,
} from "@openducktor/contracts";
import { arrayResultSchema, type InvokeFn } from "./invoke-utils";

export class HostWorkspaceSessionClient {
  constructor(private readonly invoke: InvokeFn) {}

  workspaceSessionListActive(workspaceId: string): Promise<WorkspaceSession[]> {
    return this.invoke(
      "workspace_session_list_active",
      { workspaceId },
      arrayResultSchema(workspaceSessionSchema, "workspace_session_list_active"),
    );
  }

  workspaceSessionListArchived(workspaceId: string): Promise<WorkspaceSession[]> {
    return this.invoke(
      "workspace_session_list_archived",
      { workspaceId },
      arrayResultSchema(workspaceSessionSchema, "workspace_session_list_archived"),
    );
  }

  workspaceSessionGet(input: WorkspaceSessionRefInput): Promise<WorkspaceSession> {
    return this.invoke("workspace_session_get", input, workspaceSessionSchema);
  }

  workspaceSessionCreate(
    input: WorkspaceSessionCreateInput,
  ): Promise<WorkspaceSessionCreateResult> {
    return this.invoke("workspace_session_create", input, workspaceSessionCreateResultSchema);
  }

  workspaceSessionRename(
    input: WorkspaceSessionRefInput & { manualTitle: string | null },
  ): Promise<WorkspaceSession> {
    return this.invoke("workspace_session_rename", input, workspaceSessionSchema);
  }

  workspaceSessionArchive(
    input: WorkspaceSessionRefInput & { confirmStop: boolean },
  ): Promise<WorkspaceSession> {
    return this.invoke("workspace_session_archive", input, workspaceSessionSchema);
  }

  workspaceSessionRestore(input: WorkspaceSessionRefInput): Promise<WorkspaceSession> {
    return this.invoke("workspace_session_restore", input, workspaceSessionSchema);
  }
}
