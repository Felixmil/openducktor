import {
  type WorkspaceSessionWorktreeInput,
  type HostInvokeFailure,
  type GitBranch,
  workspaceSessionBranchNameSchema,
  workspaceSessionWorktreeNameSchema,
} from "@openducktor/contracts";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { type ReactElement, useState } from "react";
import { toBranchSelectorOptions } from "@/components/features/repository/branch-selector-model";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  segmentedControlRootClassName,
  segmentedControlTriggerClassName,
} from "@/components/ui/segmented-control-classnames";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/errors";
import { repoConfigQueryOptions } from "@/state/queries/workspace";
import type { ActiveWorkspace } from "@/types/state-slices";

type Props = {
  workspace: ActiveWorkspace;
  value: WorkspaceSessionWorktreeInput;
  onChange: (value: WorkspaceSessionWorktreeInput) => void;
  disabled: boolean;
  branches: UseQueryResult<GitBranch[]>;
  error: {
    field: Extract<HostInvokeFailure, { kind: "workspace_session_validation" }>["field"];
    message: string;
  } | null;
};

const worktreeTabClassName = segmentedControlTriggerClassName({
  size: "md",
  className: "border-none data-[state=active]:border-transparent",
});

export function WorkspaceSessionWorktreeFields({
  workspace,
  value,
  onChange,
  disabled,
  error,
  branches,
}: Props): ReactElement {
  const [advanced, setAdvanced] = useState(false);
  const config = useQuery(repoConfigQueryOptions(workspace.workspaceId));
  const localBranches = (branches.data ?? []).filter((branch) => !branch.isRemote);
  const branchOptions = toBranchSelectorOptions(localBranches).map((option, index) => {
    const branch = localBranches[index];
    return branch?.worktreePath
      ? { ...option, disabled: true, description: `Already checked out at ${branch.worktreePath}` }
      : option;
  });
  const parsedName = workspaceSessionWorktreeNameSchema.safeParse(value.name);
  const nameError =
    error?.field === "worktree.name"
      ? error.message
      : value.name.length > 0 && !parsedName.success
        ? "Use letters, numbers, hyphens, or underscores, starting with a letter or number. Names must be at most 80 characters."
        : null;
  const branchError =
    value.branchName !== null &&
    value.branchName.length > 0 &&
    !workspaceSessionBranchNameSchema.safeParse(value.branchName).success;
  const defaultBranch =
    config.data && parsedName.success ? `${config.data.branchPrefix}/${parsedName.data}` : "";
  const selectedWorktree =
    value.mode === "from_branch"
      ? localBranches.find((branch) => branch.name === value.branchName)?.worktreePath
      : undefined;
  const branchFailure =
    error?.field === "worktree.branchName"
      ? error.message
      : selectedWorktree
        ? `This branch is already checked out at ${selectedWorktree}. Choose another branch or use Current checkout.`
        : null;
  const branchValidation = branchFailure && (
    <p
      id="workspace-session-branch-error"
      role="alert"
      className="break-words text-sm text-destructive"
    >
      {branchFailure}
    </p>
  );
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <Tabs
        value={value.mode}
        onValueChange={(mode) => {
          if (mode === "from_branch") onChange({ mode, name: value.name, branchName: "" });
          if (mode === "from_name") onChange({ mode, name: value.name, branchName: null });
        }}
      >
        <TabsList
          aria-label="Worktree creation mode"
          className={segmentedControlRootClassName({ size: "md", className: "w-full" })}
        >
          <TabsTrigger value="from_branch" disabled={disabled} className={worktreeTabClassName}>
            Existing branch
          </TabsTrigger>
          <TabsTrigger value="from_name" disabled={disabled} className={worktreeTabClassName}>
            New branch
          </TabsTrigger>
        </TabsList>
        <TabsContent value="from_branch" className="pt-2">
          <div className="grid gap-1.5">
            <Label id="workspace-session-existing-branch">Existing branch</Label>
            <Combobox
              triggerAriaLabelledBy="workspace-session-existing-branch"
              triggerAriaDescribedBy={
                branchFailure
                  ? "workspace-session-existing-branch-hint workspace-session-branch-error"
                  : "workspace-session-existing-branch-hint"
              }
              value={value.branchName ?? ""}
              options={branchOptions}
              placeholder={branches.isPending ? "Loading branches…" : "Select a local branch"}
              disabled={disabled || branches.isPending || branches.isError}
              onValueChange={(branchName) => {
                const name =
                  value.name ||
                  branchName
                    .replace(/[^a-zA-Z0-9_-]+/g, "-")
                    .replace(/^-+/, "")
                    .slice(0, 80);
                onChange({ mode: "from_branch", name, branchName });
              }}
            />
            <p
              id="workspace-session-existing-branch-hint"
              className="text-xs text-muted-foreground"
            >
              Uses this branch directly. It must not be checked out elsewhere.
            </p>
            {branchValidation}
            {branches.isError && (
              <div role="alert">
                <p className="text-sm text-destructive">{errorMessage(branches.error)}</p>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => void branches.refetch()}
                >
                  Retry branches
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="from_name" className="pt-2">
          <p className="text-xs text-muted-foreground">
            Creates a new branch from the current checkout's committed HEAD.
          </p>
        </TabsContent>
      </Tabs>
      <div className="grid gap-1.5" data-invalid={Boolean(nameError) || undefined}>
        <Label htmlFor="workspace-session-worktree-name">Worktree name</Label>
        <Input
          id="workspace-session-worktree-name"
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="my-feature"
          autoComplete="off"
          maxLength={80}
          disabled={disabled}
          aria-invalid={Boolean(nameError)}
          aria-describedby={
            nameError
              ? "workspace-session-worktree-name-hint workspace-session-worktree-name-error"
              : "workspace-session-worktree-name-hint"
          }
        />
        <p id="workspace-session-worktree-name-hint" className="text-xs text-muted-foreground">
          Spaces and slashes become hyphens in the directory name.
        </p>
        {parsedName.success && (
          <p className="break-all text-xs text-muted-foreground">
            Directory: <span className="font-mono">{parsedName.data}</span>
          </p>
        )}
        {nameError && (
          <p
            id="workspace-session-worktree-name-error"
            role="alert"
            className="break-words text-xs text-destructive"
          >
            {nameError}
          </p>
        )}
      </div>
      {value.mode === "from_name" && (
        <Collapsible open={advanced} onOpenChange={setAdvanced} disabled={disabled}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="group -ml-2"
            >
              <ChevronRight
                data-icon="inline-start"
                className="transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
              />
              Advanced
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="grid gap-1.5" data-invalid={branchError || undefined}>
              <Label htmlFor="workspace-session-branch-name">
                Branch name <span className="font-normal text-muted-foreground">optional</span>
              </Label>
              <Input
                id="workspace-session-branch-name"
                value={value.branchName ?? ""}
                onChange={(event) => onChange({ ...value, branchName: event.target.value || null })}
                placeholder={defaultBranch || "feature/my-feature"}
                autoComplete="off"
                disabled={disabled}
                aria-invalid={branchError || error?.field === "worktree.branchName"}
                aria-describedby={
                  error?.field === "worktree.branchName"
                    ? "workspace-session-branch-error"
                    : undefined
                }
              />
              {branchError && (
                <p className="text-xs text-destructive">Enter a valid Git branch name.</p>
              )}
            </div>
          </CollapsibleContent>
          {(value.branchName || defaultBranch) && (
            <p className="mt-1 break-all text-xs text-muted-foreground">
              New branch: <span className="font-mono">{value.branchName || defaultBranch}</span>
            </p>
          )}
          {branchValidation}
          {config.isError && (
            <div role="alert">
              <p className="text-sm text-destructive">{errorMessage(config.error)}</p>
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => void config.refetch()}
              >
                Retry branch settings
              </Button>
            </div>
          )}
        </Collapsible>
      )}
    </div>
  );
}
