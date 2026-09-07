import type { WorkspaceSession, WorkspaceSessionCreateInput } from "@openducktor/contracts";
import { HostInvokeError } from "@openducktor/host-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Folder, GitBranch, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ModelPicker } from "@/components/features/agents/model-picker";
import { SettingsModal } from "@/components/features/settings/settings-modal";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { host } from "@/state/operations/host";
import {
  customAgentRolesQueryOptions,
  updateWorkspaceSessionQueries,
} from "@/state/queries/workspace-sessions";
import type { ActiveWorkspace } from "@/types/state-slices";
import { useWorkspaceSessionModelPicker } from "./use-workspace-session-model-picker";

export function WorkspaceSessionCreateDialog({
  workspace,
  onClose,
  onCreated,
}: {
  workspace: ActiveWorkspace;
  onClose: () => void;
  onCreated: (session: WorkspaceSession) => void;
}) {
  const queryClient = useQueryClient();
  const roles = useQuery(customAgentRolesQueryOptions());
  const model = useWorkspaceSessionModelPicker(workspace.repoPath);
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("none");
  const [location, setLocation] =
    useState<WorkspaceSessionCreateInput["location"]>("local_repo_root");
  const [confirmChanges, setConfirmChanges] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const create = useMutation({
    mutationFn: (input: WorkspaceSessionCreateInput) => host.workspaceSessionCreate(input),
    onSuccess: (result, input) => {
      updateWorkspaceSessionQueries(queryClient, input.workspaceId, result.session);
      if (mounted.current) onCreated(result.session);
    },
  });
  const submit = (confirmUncommittedChanges: boolean) => {
    const selection = model.selection;
    if (!selection?.runtimeKind || create.isPending) return;
    setConfirmChanges(false);
    create.mutate(
      {
        workspaceId: workspace.workspaceId,
        runtimeKind: selection.runtimeKind,
        selectedModel: { ...selection, runtimeKind: selection.runtimeKind },
        customAgentRoleId: roleId === "none" ? null : roleId,
        location,
        manualTitle: name,
        confirmUncommittedChanges,
      },
      {
        onError: (error) => {
          if (
            error instanceof HostInvokeError &&
            error.failure?.kind === "workspace_session_confirmation" &&
            error.failure.field === "confirmUncommittedChanges"
          )
            setConfirmChanges(true);
        },
      },
    );
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !create.isPending) onClose();
      }}
    >
      <DialogContent className="my-0 max-w-xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>New session</DialogTitle>
          <DialogDescription>Choose where the agent works and how it starts.</DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            submit(false);
          }}
        >
          <fieldset disabled={create.isPending} className="contents">
            <DialogBody className="flex flex-col gap-3 px-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="workspace-session-name">
                  Name <span className="font-normal text-muted-foreground">optional</span>
                </Label>
                <Input
                  id="workspace-session-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="What are you working on?"
                  maxLength={120}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Runtime and model</Label>
                  <ModelPicker
                    {...model.modelPicker}
                    selectionPolicy={
                      create.isPending
                        ? { kind: "read_only", reason: "Creating session." }
                        : model.modelPicker.selectionPolicy
                    }
                    triggerClassName="w-full justify-between"
                  />
                </div>
                <div className="space-y-2">
                  <Label id="workspace-session-effort">Effort</Label>
                  <Combobox
                    triggerAriaLabelledBy="workspace-session-effort"
                    value={model.selection?.variant ?? ""}
                    onValueChange={model.handleSelectVariant}
                    options={model.variantOptions}
                    disabled={create.isPending || model.variantOptions.length === 0}
                    placeholder="Not supported"
                  />
                </div>
              </div>
              {model.supportsProfiles && (
                <div className="space-y-2">
                  <Label id="workspace-session-profile">Runtime Profile</Label>
                  <Combobox
                    triggerAriaLabelledBy="workspace-session-profile"
                    value={model.selection?.profileId ?? ""}
                    onValueChange={model.handleSelectAgentProfile}
                    options={model.agentProfileOptions}
                    disabled={create.isPending}
                    placeholder="Runtime default"
                  />
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label id="workspace-session-role">
                    Custom role <span className="font-normal text-muted-foreground">optional</span>
                  </Label>
                  <SettingsModal
                    triggerLabel="Manage roles"
                    deepLink={{ kind: "custom-agent-roles" }}
                  />
                </div>
                <Combobox
                  triggerAriaLabelledBy="workspace-session-role"
                  value={roleId}
                  onValueChange={setRoleId}
                  disabled={create.isPending || roles.isPending || roles.isError}
                  options={[
                    { value: "none", label: "No Role" },
                    ...(roles.data ?? []).map((role) => ({ value: role.id, label: role.name })),
                  ]}
                />
                {roles.isError && (
                  <div role="alert">
                    <p className="text-sm text-destructive">{errorMessage(roles.error)}</p>
                    <Button type="button" variant="ghost" onClick={() => void roles.refetch()}>
                      Retry roles
                    </Button>
                  </div>
                )}
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">Work location</legend>
                <div
                  role="radiogroup"
                  aria-label="Work location"
                  className="grid grid-cols-2 gap-3"
                >
                  {(
                    [
                      {
                        kind: "local_repo_root",
                        label: "Current checkout",
                        description: "Work with the files already here.",
                        icon: Folder,
                      },
                      {
                        kind: "local_worktree",
                        label: "New worktree",
                        description: "Use an isolated directory and branch.",
                        icon: GitBranch,
                      },
                    ] as const
                  ).map((target) => (
                    <Button
                      key={target.kind}
                      type="button"
                      role="radio"
                      aria-checked={location === target.kind}
                      variant="outline"
                      onClick={() => {
                        setLocation(target.kind);
                        setConfirmChanges(false);
                      }}
                      className={cn(
                        "h-auto items-start justify-start gap-3 whitespace-normal p-3 text-left",
                        location === target.kind && "border-primary bg-accent",
                      )}
                    >
                      <target.icon />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span>{target.label}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {target.description}
                        </span>
                      </span>
                      {location === target.kind && <Check />}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {location === "local_worktree"
                    ? "Starts from committed HEAD. Uncommitted changes stay in the current checkout."
                    : "Changes apply directly to this workspace checkout."}
                </p>
              </fieldset>
              {create.error && !confirmChanges && (
                <p role="alert" className="text-sm text-destructive">
                  {errorMessage(create.error)}
                </p>
              )}
              {confirmChanges && (
                <div
                  role="alert"
                  className="space-y-2 rounded-md border border-border bg-muted p-3"
                >
                  <p className="text-sm">
                    This checkout has uncommitted changes. The new worktree will not include them.
                  </p>
                  <Button type="button" onClick={() => submit(true)}>
                    Create without uncommitted changes
                  </Button>
                </div>
              )}
            </DialogBody>
            <DialogFooter className="border-t border-border bg-muted/30 px-6 py-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  create.isPending ||
                  !model.selection ||
                  !model.selectedModelEntry ||
                  roles.isPending ||
                  roles.isError
                }
              >
                {create.isPending && <LoaderCircle className="animate-spin" />}
                {create.isPending ? "Creating session…" : "Create session"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
