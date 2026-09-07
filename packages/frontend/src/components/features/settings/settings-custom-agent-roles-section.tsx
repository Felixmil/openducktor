import type { CustomAgentRole, CustomAgentRoleInput } from "@openducktor/contracts";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { host } from "@/state/operations/host";
import { customAgentRolesQueryOptions } from "@/state/queries/workspace-sessions";

const roleMutationKey = ["custom-agent-role-edit"] as const;

function CustomAgentRoleEditor({
  role,
  disabled,
  onSaved,
  onDeleted,
}: {
  role: CustomAgentRole | null;
  disabled: boolean;
  onSaved: (role: CustomAgentRole) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [systemPrompt, setSystemPrompt] = useState(role?.systemPrompt ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useMutation({
    mutationKey: roleMutationKey,
    mutationFn: (input: CustomAgentRoleInput) =>
      role ? host.customAgentRoleUpdate(role.id, input) : host.customAgentRoleCreate(input),
    onSuccess: onSaved,
  });
  const remove = useMutation({
    mutationKey: roleMutationKey,
    mutationFn: (id: string) => host.customAgentRoleDelete(id),
    onSuccess: (_, id) => onDeleted(id),
  });
  const pending = save.isPending || remove.isPending;
  const error = save.error ?? remove.error;
  return (
    <>
      <form
        className="flex h-full min-h-0 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({ name, systemPrompt });
        }}
      >
        <fieldset disabled={disabled || pending} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-semibold">{role ? role.name : "New role"}</h3>
              <p className="text-sm text-muted-foreground">
                Define how this agent should work in a new chat.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="custom-role-name">Role name</Label>
              <Input
                id="custom-role-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Code reviewer"
                required
              />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="custom-role-prompt">System prompt</Label>
              <Textarea
                id="custom-role-prompt"
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                rows={8}
                placeholder="Describe the agent's purpose, what it should focus on, and how it should respond."
                required
                className="min-h-40 flex-1 resize-y font-mono text-sm leading-relaxed"
              />
              <p className="text-xs text-muted-foreground">
                New chats use these instructions. Existing chats keep their original role.
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(error)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-popover px-5 py-3">
            {role && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Delete role
              </Button>
            )}
            <div className="ml-auto flex items-center gap-3">
              {save.isSuccess && (
                <span
                  role="status"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Check className="size-3.5" />
                  Role saved
                </span>
              )}
              <Button type="submit" disabled={!name.trim() || !systemPrompt.trim()}>
                {save.isPending && <LoaderCircle className="animate-spin" />}Save role
              </Button>
            </div>
          </div>
        </fieldset>
      </form>
      <Dialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!pending) setConfirmDelete(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {role?.name}?</DialogTitle>
            <DialogDescription>
              This removes the role from future session choices. Existing sessions keep their saved
              instructions.
            </DialogDescription>
          </DialogHeader>
          {remove.error && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(remove.error)}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (role) remove.mutate(role.id);
              }}
            >
              {remove.isPending && <LoaderCircle className="animate-spin" />}Delete role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SettingsCustomAgentRolesSection({ disabled }: { disabled: boolean }) {
  const queryClient = useQueryClient();
  const pending = useIsMutating({ mutationKey: roleMutationKey }) > 0;
  const options = customAgentRolesQueryOptions();
  const roles = useQuery(options);
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [newRoleGeneration, setNewRoleGeneration] = useState(0);
  const selectedRole =
    selectedId === undefined
      ? (roles.data?.[0] ?? null)
      : (roles.data?.find((role) => role.id === selectedId) ?? null);
  const isCreating = selectedId === null;
  if (roles.isPending)
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        Loading custom roles…
      </p>
    );
  if (roles.isError)
    return (
      <div role="alert" className="flex flex-col gap-3 p-6">
        <p className="text-destructive">{errorMessage(roles.error)}</p>
        <Button variant="outline" onClick={() => void roles.refetch()}>
          Retry
        </Button>
      </div>
    );
  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-cols-[180px_minmax(0,1fr)] md:grid-rows-1 xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto border-b border-border bg-muted/50 p-4 md:border-b-0 md:border-r">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">Custom agent roles</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Reusable instructions for workspace chats.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          disabled={disabled || pending}
          onClick={() => {
            setSelectedId(null);
            setNewRoleGeneration((value) => value + 1);
          }}
        >
          <Plus />
          New role
        </Button>
        <nav
          aria-label="Custom agent roles"
          className="flex min-w-0 flex-col gap-1 max-md:max-h-24 max-md:overflow-y-auto"
        >
          {roles.data.map((role) => (
            <Button
              key={role.id}
              variant={role.id === selectedRole?.id ? "accent" : "ghost"}
              className="w-full justify-start"
              disabled={disabled || pending}
              aria-current={role.id === selectedRole?.id ? "true" : undefined}
              onClick={() => setSelectedId(role.id)}
            >
              <Bot aria-hidden="true" />
              <span className="min-w-0 truncate">{role.name}</span>
            </Button>
          ))}
        </nav>
        <p className="mt-auto hidden text-xs leading-relaxed text-muted-foreground md:block">
          Available in every workspace. Roles save separately from other settings.
        </p>
      </aside>
      <div className="min-h-0 min-w-0">
        {selectedRole || isCreating ? (
          <CustomAgentRoleEditor
            key={selectedRole?.id ?? `new-${newRoleGeneration}`}
            role={selectedRole}
            disabled={disabled}
            onSaved={(role) => {
              void queryClient.cancelQueries({ queryKey: options.queryKey });
              queryClient.setQueryData(options.queryKey, (current) =>
                [...(current ?? []).filter((entry) => entry.id !== role.id), role].sort((a, b) =>
                  a.name.localeCompare(b.name),
                ),
              );
              setSelectedId(role.id);
            }}
            onDeleted={(id) => {
              void queryClient.cancelQueries({ queryKey: options.queryKey });
              queryClient.setQueryData(options.queryKey, (current) =>
                current?.filter((entry) => entry.id !== id),
              );
              setSelectedId(undefined);
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center">
            <Bot className="size-8 text-muted-foreground" aria-hidden="true" />
            <div className="flex max-w-sm flex-col gap-2">
              <h3 className="text-base font-semibold">Give your agent a role</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Save instructions for a code reviewer, a research assistant, or another agent you
                use often. Choose the role when you start a chat.
              </p>
            </div>
            <Button disabled={disabled || pending} onClick={() => setSelectedId(null)}>
              <Plus />
              Create your first role
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
