import {
  type WorkspaceSessionWorktreeInput,
  workspaceSessionBranchNameSchema,
  workspaceSessionWorktreeNameSchema,
} from "@openducktor/contracts";
import { useQuery } from "@tanstack/react-query";
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
import { repoBranchesQueryOptions } from "@/state/queries/git";
import { repoConfigQueryOptions } from "@/state/queries/workspace";
import type { ActiveWorkspace } from "@/types/state-slices";

type Props = {
  workspace: ActiveWorkspace;
  value: WorkspaceSessionWorktreeInput;
  onChange: (value: WorkspaceSessionWorktreeInput) => void;
  disabled: boolean;
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
}: Props): ReactElement {
  const [advanced, setAdvanced] = useState(false);
  const branches = useQuery({
    ...repoBranchesQueryOptions(workspace.repoPath),
    enabled: value.mode === "from_branch",
  });
  const config = useQuery(repoConfigQueryOptions(workspace.workspaceId));
  const branchOptions = toBranchSelectorOptions(
    (branches.data ?? []).filter((branch) => !branch.isRemote),
  );
  const parsedName = workspaceSessionWorktreeNameSchema.safeParse(value.name);
  const nameError = value.name.length > 0 && !parsedName.success;
  const branchError =
    value.branchName !== null &&
    value.branchName.length > 0 &&
    !workspaceSessionBranchNameSchema.safeParse(value.branchName).success;
  const defaultBranch =
    config.data && parsedName.success ? `${config.data.branchPrefix}/${parsedName.data}` : "";
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
            <p className="text-xs text-muted-foreground">
              Uses this branch directly. It must not be checked out elsewhere.
            </p>
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
      <div className="grid gap-1.5" data-invalid={nameError || undefined}>
        <Label htmlFor="workspace-session-worktree-name">Worktree name</Label>
        <Input
          id="workspace-session-worktree-name"
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="my-feature"
          autoComplete="off"
          maxLength={80}
          disabled={disabled}
          aria-invalid={nameError}
          aria-describedby="workspace-session-worktree-name-hint"
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
          <p role="alert" className="text-xs text-destructive">
            Use letters, numbers, hyphens, or underscores, starting with a letter or number. Names
            must be at most 80 characters.
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
                aria-invalid={branchError}
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
